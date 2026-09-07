import 'server-only';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
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
  /** Tool names invoked in this reply, one entry per tool_use block. */
  tools: string[];
  fromSubagent: boolean;
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
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

export const TRANSCRIPT_ROOT = join(homedir(), '.claude', 'projects');

interface CacheEntry {
  mtimeMs: number;
  size: number;
  records: RequestRecord[];
}

/** Parsed output per file, invalidated by mtime+size, so a multi-GB corpus is not re-read per page view. */
const fileCache = new Map<string, CacheEntry>();

export async function ingestAll(): Promise<{ records: RequestRecord[]; files: number }> {
  const files = await walk(TRANSCRIPT_ROOT);
  const perFile = await Promise.all(files.map((f) => ingestFile(f)));
  return { records: perFile.flat(), files: files.length };
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
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const raw of rl) {
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
    const tools = toolNames(line.message.content);
    const existing = byRequest.get(key);
    if (existing) {
      existing.usage = maxMerge(existing.usage, usage);
      existing.tools.push(...tools);
    } else {
      byRequest.set(key, {
        uuid: line.uuid,
        requestId: key,
        sessionId: line.sessionId ?? sessionFromPath,
        project,
        model,
        timestamp: line.timestamp ? Date.parse(line.timestamp) : 0,
        usage,
        tools,
        fromSubagent: fromSubagent || line.isSidechain === true,
      });
    }
  }
  return [...byRequest.values()];
}

function toolNames(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_use') {
      const name = (block as { name?: string }).name;
      if (name) out.push(name);
    }
  }
  return out;
}
