import { deref, flattenAllOf, type JsonObject, type OpenApiSpec } from './spec.js';


export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ToolParam {
  name: string;
  in: 'path' | 'query';
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonObject;
  method: HttpMethod;
  path: string;
  params: ToolParam[];
  hasBody: boolean;
}

export type IsLive = (method: HttpMethod, path: string) => boolean;

export const CONFIRM_REQUIRED: ReadonlyArray<{ method: HttpMethod; path: string; warning: string }> = [
  {
    method: 'PUT',
    path: '/providers/{provider}',
    warning:
      'Stores a provider credential. Every LLM-backed request made with this Helix API key '
      + 'afterwards uses it instead of the instance credentials.',
  },
  {
    method: 'DELETE',
    path: '/providers/{provider}',
    warning:
      'Removes the stored credential for this provider. Later calls fall back to the instance credentials.',
  },
  {
    method: 'DELETE',
    path: '/monitor/{id}',
    warning:
      'Deletes the monitor along with its snapshots, history and pending deliveries. Not recoverable.',
  },
  {
    method: 'DELETE',
    path: '/batch/scrape/{id}',
    warning: 'Cancels the batch job. Results not yet delivered are lost.',
  },
];

export function needsConfirmation(method: HttpMethod, path: string): string | undefined {
  return CONFIRM_REQUIRED.find((e) => e.method === method && e.path === path)?.warning;
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toolName(operationId: string): string {
  const snake = operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase();
  return `helix_${snake}`;
}

function fallbackOperationId(method: HttpMethod, path: string): string {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((p) => (p.startsWith('{') ? `by_${p.slice(1, -1)}` : p));
  return `${method.toLowerCase()}_${parts.join('_')}`;
}

function describe(operation: JsonObject): string {
  const summary = typeof operation['summary'] === 'string' ? operation['summary'].trim() : '';
  const description = typeof operation['description'] === 'string' ? operation['description'].trim() : '';
  const responses = operation['responses'];
  let returns = '';
  if (isObject(responses)) {
    const ok = responses['200'] ?? responses['202'] ?? responses['201'] ?? responses['204'];
    if (isObject(ok) && typeof ok['description'] === 'string') returns = ok['description'].trim();
  }
  return [summary, description, returns ? `Returns: ${returns}` : ''].filter(Boolean).join('\n\n');
}

function bodySchema(operation: JsonObject, spec: OpenApiSpec): JsonObject | undefined {
  const requestBody = deref(operation['requestBody'], spec);
  if (!isObject(requestBody)) return undefined;
  const content = requestBody['content'];
  if (!isObject(content)) return undefined;
  const json = content['application/json'];
  if (!isObject(json) || !isObject(json['schema'])) return undefined;
  return flattenAllOf(deref(json['schema'], spec));
}

function collectParams(pathItem: JsonObject, operation: JsonObject, spec: OpenApiSpec): JsonObject[] {
  const merged = new Map<string, JsonObject>();
  for (const source of [pathItem['parameters'], operation['parameters']]) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      const param = deref(raw, spec);
      if (isObject(param) && typeof param['name'] === 'string' && typeof param['in'] === 'string') {
        merged.set(`${param['in']}:${param['name']}`, param);
      }
    }
  }
  return [...merged.values()];
}

export function generateTools(spec: OpenApiSpec, isLive: IsLive = () => true): ToolDef[] {
  const tools: ToolDef[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isObject(pathItem)) continue;

    for (const method of METHODS) {
      const operation = pathItem[method.toLowerCase()];
      if (!isObject(operation)) continue;
      if (!isLive(method, path)) continue;

      const operationId =
        typeof operation['operationId'] === 'string' ? operation['operationId'] : fallbackOperationId(method, path);

      const body = bodySchema(operation, spec);
      const properties: JsonObject = isObject(body?.['properties']) ? { ...body['properties'] } : {};
      const required = new Set<string>(Array.isArray(body?.['required']) ? (body['required'] as string[]) : []);
      const params: ToolParam[] = [];

      for (const param of collectParams(pathItem, operation, spec)) {
        const name = param['name'] as string;
        const where = param['in'] as string;
        if (where !== 'path' && where !== 'query') continue;
        const schema = isObject(param['schema']) ? param['schema'] : { type: 'string' };
        properties[name] = {
          ...schema,
          ...(typeof param['description'] === 'string' ? { description: param['description'] } : {}),
        };
        if (param['required'] === true || where === 'path') required.add(name);
        params.push({ name, in: where });
      }

      const warning = needsConfirmation(method, path);
      if (warning) {
        properties['confirm'] = {
          type: 'boolean',
          description: `Required. Set true to run this. ${warning}`,
        };
        required.add('confirm');
      }

      const inputSchema: JsonObject = {
        type: 'object',
        properties,
        ...(required.size > 0 ? { required: [...required] } : {}),
      };

      tools.push({
        name: toolName(operationId),
        description: warning
          ? `${describe(operation)}\n\nRequires confirm: true. ${warning}`
          : describe(operation),
        inputSchema,
        method,
        path,
        params,
        hasBody: body !== undefined,
      });
    }
  }

  return tools;
}

export interface PlannedRequest {
  method: HttpMethod;
  url: string;
  body?: Record<string, unknown>;
}

export function planRequest(tool: ToolDef, args: Record<string, unknown>, prefix = '/v1'): PlannedRequest {
  let path = tool.path;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = { ...args };

  delete body['confirm'];

  for (const param of tool.params) {
    const value = body[param.name];
    delete body[param.name];
    if (value === undefined || value === null) continue;
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) query.append(param.name, String(item));
    } else if (typeof value === 'object') {
      throw new Error(`${param.name}: query parameters cannot be an object`);
    } else {
      query.set(param.name, String(value));
    }
  }

  const qs = query.toString();
  const url = `${prefix}${path}${qs ? `?${qs}` : ''}`;
  return tool.hasBody ? { method: tool.method, url, body } : { method: tool.method, url };
}
