import 'server-only';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join, relative, sep } from 'node:path';
import { createInterface } from 'node:readline';
import type { Usage } from './pricing';

/**
 * One API request, reconstructed from a Claude Code transcript.
 *
 * A streamed reply is written as one JSONL line per content block, every line
 * repeating `requestId` and a usage block; only the final line carries the
 * true `output_tokens`. Lines sharing a request are therefore max-merged per
 * usage field, never summed.
 */
export interface RequestRecord {
  /** uuid of the first line seen for this request; the cross-file dedup key. */
  uuid: string;
  requestId: string;
  sessionId: string;
  project: string;
  model: string;
  timestamp: number;
  usage: Usage;
  /** Thinking tokens within `usage.output`, when the SDK reported them. */
  thinking: number;
  /** Tool names invoked in this reply, one entry per tool_use block. */
  tools: string[];
  /** Names of the tools whose result came back `is_error`, resolved through the tool_use id. */
  toolErrors: string[];
  /** Time from the user line that prompted this reply to its first streamed line; null when no user line precedes it closely enough. */
  latencyMs: number | null;
  fromSubagent: boolean;
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { thinking_tokens?: number };
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

interface TranscriptLine {
  type?: string;
  uuid?: string;
  requestId?: string;
  sessionId?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { model?: string; usage?: UsageBlock; content?: unknown };
}

/** A reply more than this long after the last user line is not a response to it (a resumed session, say). */
const MAX_LATENCY_MS = 15 * 60_000;
const TIMESTAMP_RE = /"timestamp":"([^"]+)"/;

export const TRANSCRIPT_ROOT = join(homedir(), '.claude', 'projects');

interface CacheEntry {
  mtimeMs: number;
  size: number;
  records: RequestRecord[];
}

/** Parsed output per file, invalidated by mtime+size, so a multi-GB corpus is not re-read per page view. */
const fileCache = new Map<string, CacheEntry>();

export async function ingestAll(): Promise<{ records: RequestRecord[]; files: number; root: string; host: string }> {
  const files = await walk(TRANSCRIPT_ROOT);
  const perFile = await Promise.all(files.map((f) => ingestFile(f)));
  return { records: perFile.flat(), files: files.length, root: TRANSCRIPT_ROOT, host: hostname() };
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'tool-results' || e.name === 'memory') continue;
      out.push(...(await walk(p)));
    } else if (e.isFile() && e.name.endsWith('.jsonl')) {
      out.push(p);
    }
  }
  return out;
}

async function ingestFile(path: string): Promise<RequestRecord[]> {
  const s = await stat(path);
  const cached = fileCache.get(path);
  if (cached && cached.mtimeMs === s.mtimeMs && cached.size === s.size) return cached.records;

  const records = await parseFile(path);
  fileCache.set(path, { mtimeMs: s.mtimeMs, size: s.size, records });
  return records;
}

function usageOf(u: UsageBlock): Usage {
  const total = u.cache_creation_input_tokens ?? 0;
  const split = u.cache_creation;
  // Older SDK lines carry only the total; charge those at the cheaper 5m rate rather than guess.
  const c5 = split ? (split.ephemeral_5m_input_tokens ?? 0) : total;
  const c1 = split ? (split.ephemeral_1h_input_tokens ?? 0) : 0;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreate5m: c5,
    cacheCreate1h: c1,
  };
}

function maxMerge(a: Usage, b: Usage): Usage {
  return {
    input: Math.max(a.input, b.input),
    output: Math.max(a.output, b.output),
    cacheRead: Math.max(a.cacheRead, b.cacheRead),
    cacheCreate5m: Math.max(a.cacheCreate5m, b.cacheCreate5m),
    cacheCreate1h: Math.max(a.cacheCreate1h, b.cacheCreate1h),
  };
}

async function parseFile(path: string): Promise<RequestRecord[]> {
  const rel = relative(TRANSCRIPT_ROOT, path).split(sep);
  const project = rel[0] ?? '';
  const fromSubagent = rel.includes('subagents');
  const sessionFromPath = (fromSubagent ? rel[1] : rel[rel.length - 1]?.replace(/\.jsonl$/, '')) ?? '';

  const byRequest = new Map<string, RequestRecord>();
  const byToolUse = new Map<string, { record: RequestRecord; name: string }>();
  let lastUserAt: number | null = null;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const raw of rl) {
    // A tool result's content is JSON-escaped, so these top-level markers cannot match inside it.
    if (raw.includes('"type":"user"')) {
      const ts = TIMESTAMP_RE.exec(raw)?.[1];
      if (ts) lastUserAt = Date.parse(ts);
      if (raw.includes('"is_error":true')) markToolErrors(raw, byToolUse);
      continue;
    }
    if (!raw.includes('"type":"assistant"')) continue;
    let line: TranscriptLine;
    try {
      line = JSON.parse(raw) as TranscriptLine;
    } catch {
      continue;
    }
    if (line.type !== 'assistant' || !line.message?.usage || !line.uuid) continue;
    const model = line.message.model ?? '';
    if (!model || model === '<synthetic>') continue;

    const key = line.requestId ?? line.uuid;
    const usage = usageOf(line.message.usage);
    const thinking = line.message.usage.output_tokens_details?.thinking_tokens ?? 0;
    const uses = toolUses(line.message.content);
    let record = byRequest.get(key);
    if (record) {
      record.usage = maxMerge(record.usage, usage);
      record.thinking = Math.max(record.thinking, thinking);
      record.tools.push(...uses.map((u) => u.name));
    } else {
      const timestamp = line.timestamp ? Date.parse(line.timestamp) : 0;
      const gap = lastUserAt === null ? null : timestamp - lastUserAt;
      record = {
        uuid: line.uuid,
        requestId: key,
        sessionId: line.sessionId ?? sessionFromPath,
        project,
        model,
        timestamp,
        usage,
        thinking,
        tools: uses.map((u) => u.name),
        toolErrors: [],
        latencyMs: gap !== null && gap >= 0 && gap <= MAX_LATENCY_MS ? gap : null,
        fromSubagent: fromSubagent || line.isSidechain === true,
      };
      byRequest.set(key, record);
    }
    for (const u of uses) byToolUse.set(u.id, { record, name: u.name });
  }
  return [...byRequest.values()];
}

function toolUses(content: unknown): { id: string; name: string }[] {
  if (!Array.isArray(content)) return [];
  const out: { id: string; name: string }[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_use') {
      const { id, name } = block as { id?: string; name?: string };
      if (id && name) out.push({ id, name });
    }
  }
  return out;
}

/** Only lines carrying an error are parsed; every other user line is read by regex, since tool results make up most of the corpus by bytes. */
function markToolErrors(raw: string, byToolUse: Map<string, { record: RequestRecord; name: string }>): void {
  let line: TranscriptLine;
  try {
    line = JSON.parse(raw) as TranscriptLine;
  } catch {
    return;
  }
  const content = line.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: string; is_error?: boolean; tool_use_id?: string };
    if (b.type !== 'tool_result' || b.is_error !== true || !b.tool_use_id) continue;
    const owner = byToolUse.get(b.tool_use_id);
    if (owner) owner.record.toolErrors.push(owner.name);
  }
}
