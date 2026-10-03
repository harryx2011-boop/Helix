import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { INTERNAL_TICKET_HEADER, type InternalTickets } from '../core/auth.js';
import { loadSpec, type OpenApiSpec } from './spec.js';
import { slimManifest, type ManifestTool } from './slim.js';
import { pullImages, shapeResponse, type ImageBlock } from './shape.js';
import { generateTools, needsConfirmation, planRequest, type HttpMethod, type ToolDef } from './tools.js';

/**
 * MCP over streamable HTTP at `/mcp`.
 *
 * Every tool call is replayed as an in-process HTTP request against the same
 * Fastify instance. Zod validation and the typed failure envelope are therefore
 * identical whether an agent arrives over MCP or curl: there is one code path,
 * not two. The key is verified and charged once, on the outer POST; the replay
 * carries a single-use ticket bound to that key so the auth hook does not
 * verify or charge it a second time (an MCP call costs exactly one HTTP call).
 *
 * The transport is stateless (no session ids). Each POST gets a fresh Server
 * and transport, which is what the SDK recommends when nothing is kept between
 * calls and it keeps concurrent agents from sharing state.
 */

export interface McpDeps {
  spec?: OpenApiSpec;
  /** Route prefix the spec's paths are served under. */
  prefix?: string;
  version?: string;
  /** Issues the replay's ticket; without it the bearer header is forwarded and charged again. */
  tickets?: InternalTickets;
  /**
   * Tool names to expose; undefined exposes every live operation. An MCP client
   * loads every listed schema into the model's context on connect, so an
   * operator can trim the list to the tools an agent needs.
   */
  only?: readonly string[] | undefined;
}

const SPEC_TO_FASTIFY = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1');

export function liveTools(app: FastifyInstance, spec: OpenApiSpec, prefix: string): ToolDef[] {
  const isLive = (method: HttpMethod, path: string): boolean =>
    app.hasRoute({ method, url: `${prefix}${SPEC_TO_FASTIFY(path)}` });
  return generateTools(spec, isLive);
}

function contentFromResponse(statusCode: number, payload: string, shaped?: (body: unknown) => unknown): {
  content: ({ type: 'text'; text: string } | ImageBlock)[];
  isError?: boolean;
} {
  // Compact, not pretty-printed: the reader is a model, and indentation
  // carries nothing. Small on a scrape (one markdown string), larger on crawl
  // and search pages that nest one object per result. A failure is passed
  // through whole: the model needs every word of it.
  let text = payload;
  const images: ImageBlock[] = [];
  try {
    const body: unknown = JSON.parse(payload);
    text = JSON.stringify(statusCode < 400 ? pullImages(shaped ? shaped(body) : body, images) : body);
  } catch {
    // Not JSON (204, or a body the route streamed); return it verbatim.
  }
  const content = [{ type: 'text' as const, text }, ...images];
  return statusCode >= 400 ? { content, isError: true } : { content };
}

export async function registerMcp(app: FastifyInstance, deps: McpDeps = {}): Promise<void> {
  const prefix = deps.prefix ?? '/v1';
  const version = deps.version ?? '0.1.0';
  let spec = deps.spec;
  let tools: ToolDef[] | undefined;

  // Resolved on first use rather than at registration: routes registered after
  // this plugin still count, and a missing spec surfaces as a 500 on /mcp rather
  // than a crash at boot.
  const getTools = (): ToolDef[] => {
    if (!tools) {
      spec ??= loadSpec();
      tools = liveTools(app, spec, prefix);
      if (deps.only) {
        const keep = new Set(deps.only);
        tools = tools.filter((t) => keep.has(t.name));
      }
    }
    return tools;
  };

  let manifest: ManifestTool[] | undefined;
  const getManifest = (): ManifestTool[] => (manifest ??= slimManifest(getTools()));

  const buildServer = (request: FastifyRequest): Server => {
    const server = new Server({ name: 'helix', version }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getManifest().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as { type: 'object'; properties?: Record<string, unknown>; required?: string[] },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (call) => {
      const tool = getTools().find((t) => t.name === call.params.name);
      if (!tool) {
        return { content: [{ type: 'text', text: `Unknown tool: ${call.params.name}` }], isError: true };
      }

      /* The confirm gate. Enforced HERE rather than trusted from the schema:
         an inputSchema is a description of what a caller should send, and a
         `required` entry is not a check. This is the check. */
      const warning = needsConfirmation(tool.method, tool.path);
      if (warning && (call.params.arguments ?? {})['confirm'] !== true) {
        return {
          content: [{
            type: 'text',
            text: `confirmation_required: ${warning}\n\n`
              + `Nothing was changed. Show this to the person you are acting for, and call `
              + `${tool.name} again with "confirm": true only if they approve.`,
          }],
          isError: true,
        };
      }

      const planned = planRequest(tool, call.params.arguments ?? {}, prefix);
      const headers: Record<string, string> = {};
      if (request.headers.authorization) headers['authorization'] = request.headers.authorization;
      if (planned.body !== undefined) headers['content-type'] = 'application/json';
      const ticket = deps.tickets && request.apiKey ? deps.tickets.issue(request.apiKey) : undefined;
      if (ticket) headers[INTERNAL_TICKET_HEADER] = ticket;

      try {
        const response = await app.inject({
          method: planned.method,
          url: planned.url,
          headers,
          ...(planned.body !== undefined ? { payload: planned.body } : {}),
        });
        const args = call.params.arguments ?? {};
        return contentFromResponse(response.statusCode, response.body, (body) => shapeResponse(tool.name, body, args));
      } finally {
        if (ticket) deps.tickets?.revoke(ticket);
      }
    });

    return server;
  };

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      const server = buildServer(request);
      // No sessionIdGenerator: stateless mode.
      const transport = new StreamableHTTPServerTransport({});

      // Hijacking hands the socket to the SDK transport, so headers queued on the
      // Fastify reply (X-RateLimit-*, CORS, helmet) must move to the raw response
      // first or they never leave the process.
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.hijack();
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });

      try {
        // The SDK's types are not built with exactOptionalPropertyTypes.
        await server.connect(transport as unknown as Transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (error) {
        request.log.error({ error }, 'mcp request failed');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'content-type': 'application/json' });
          reply.raw.end(
            JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }),
          );
        }
      }
    },
  });
}
