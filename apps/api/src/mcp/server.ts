import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadSpec, type OpenApiSpec } from './spec.js';
import { generateTools, planRequest, type HttpMethod, type ToolDef } from './tools.js';

/**
 * MCP over streamable HTTP at `/mcp`.
 *
 * Every tool call is replayed as an in-process HTTP request against the same
 * Fastify instance, carrying the caller's bearer key. Auth, rate limiting, zod
 * validation and the typed failure envelope are therefore identical whether an
 * agent arrives over MCP or curl: there is one code path, not two.
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
}

const SPEC_TO_FASTIFY = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1');

export function liveTools(app: FastifyInstance, spec: OpenApiSpec, prefix: string): ToolDef[] {
  const isLive = (method: HttpMethod, path: string): boolean =>
    app.hasRoute({ method, url: `${prefix}${SPEC_TO_FASTIFY(path)}` });
  return generateTools(spec, isLive);
}

function contentFromResponse(statusCode: number, payload: string): {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
} {
  let text = payload;
  try {
    text = JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    // Not JSON (204, or a body the route streamed); return it verbatim.
  }
  return statusCode >= 400 ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
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
    }
    return tools;
  };

  const buildServer = (request: FastifyRequest): Server => {
    const server = new Server({ name: 'helix', version }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getTools().map((tool) => ({
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

      const planned = planRequest(tool, call.params.arguments ?? {}, prefix);
      const headers: Record<string, string> = {};
      if (request.headers.authorization) headers['authorization'] = request.headers.authorization;
      if (planned.body !== undefined) headers['content-type'] = 'application/json';

      const response = await app.inject({
        method: planned.method,
        url: planned.url,
        headers,
        ...(planned.body !== undefined ? { payload: planned.body } : {}),
      });

      return contentFromResponse(response.statusCode, response.body);
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
