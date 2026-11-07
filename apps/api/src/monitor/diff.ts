
export type Granularity = 'word' | 'line' | 'character';

export interface DiffOp {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface Diff {
  granularity: Granularity;
  added: number;
  removed: number;
  changeRatio: number;
  ops: DiffOp[];
  text: string;
  coarse?: true;
  truncated?: true;
  summary?: string;
}

const COMPARISON_BUDGET = 40_000_000;
const MIN_EDITS = 64;
const MAX_EDITS = 4_096;

export function tokenize(input: string, granularity: Granularity): string[] {
  if (input.length === 0) return [];
  switch (granularity) {
    case 'line':
      return input.split(/\r?\n/);
    case 'character':
      return Array.from(input);
    case 'word':
      return input.split(/(\s+)/).filter((t) => t.length > 0);
  }
}

class EditLimitExceeded extends Error {}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  fx: number;
  fy: number;
}

type Snake = [number, number, number, number];

function midpoint(a: string[], b: string[], box: Box, limit: number): Snake | null {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const size = width + height;
  if (size === 0) return null;

  const max = Math.ceil(size / 2);
  const delta = width - height;
  const offset = max + 1;
  const vf = new Int32Array(2 * max + 3);
  const vb = new Int32Array(2 * max + 3);
  vf[offset + 1] = box.left;
  vb[offset + 1] = box.bottom;

  for (let d = 0; d <= max; d += 1) {
    if (d > limit) throw new EditLimitExceeded();

    for (let k = d; k >= -d; k -= 2) {
      const c = k - delta;
      let x: number;
      let px: number;
      if (k === -d || (k !== d && vf[offset + k - 1]! < vf[offset + k + 1]!)) {
        px = x = vf[offset + k + 1]!;
      } else {
        px = vf[offset + k - 1]!;
        x = px + 1;
      }
      let y = box.top + (x - box.left) - k;
      const py = d === 0 || x !== px ? y : y - 1;
      while (x < box.right && y < box.bottom && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      vf[offset + k] = x;
      if (delta % 2 !== 0 && c >= -(d - 1) && c <= d - 1 && y >= vb[offset + c]!) {
        return [px, py, x, y];
      }
    }

    for (let c = d; c >= -d; c -= 2) {
      const k = c + delta;
      let y: number;
      let py: number;
      if (c === -d || (c !== d && vb[offset + c - 1]! > vb[offset + c + 1]!)) {
        py = y = vb[offset + c + 1]!;
      } else {
        py = vb[offset + c - 1]!;
        y = py - 1;
      }
      let x = box.left + (y - box.top) + k;
      const px = d === 0 || y !== py ? x : x + 1;
      while (x > box.left && y > box.top && a[x - 1] === b[y - 1]) {
        x -= 1;
        y -= 1;
      }
      vb[offset + c] = y;
      if (delta % 2 === 0 && k >= -d && k <= d && x <= vf[offset + k]!) {
        return [x, y, px, py];
      }
    }
  }

  return null;
}

function findPath(a: string[], b: string[], limit: number): number[] {
  const points: number[] = [];
  const stack: Box[] = [{ left: 0, top: 0, right: a.length, bottom: b.length, fx: -1, fy: -1 }];

  while (stack.length > 0) {
    const box = stack.pop()!;
    const snake = midpoint(a, b, box, limit);
    if (!snake) {
      if (box.fx >= 0) points.push(box.fx, box.fy);
      continue;
    }
    const [x1, y1, x2, y2] = snake;
    stack.push({ left: x2, top: y2, right: box.right, bottom: box.bottom, fx: x2, fy: y2 });
    stack.push({ left: box.left, top: box.top, right: x1, bottom: y1, fx: x1, fy: y1 });
  }

  return points;
}

type Emit = (op: DiffOp['op'], token: string) => void;

function walkPath(a: string[], b: string[], path: number[], emit: Emit): void {
  for (let i = 0; i + 3 < path.length; i += 2) {
    let x = path[i]!;
    let y = path[i + 1]!;
    const x2 = path[i + 2]!;
    const y2 = path[i + 3]!;

    while (x < x2 && y < y2 && a[x] === b[y]) {
      emit('equal', a[x]!);
      x += 1;
      y += 1;
    }
    if (x2 - x < y2 - y) {
      emit('insert', b[y]!);
      y += 1;
    } else if (x2 - x > y2 - y) {
      emit('delete', a[x]!);
      x += 1;
    }
    while (x < x2 && y < y2 && a[x] === b[y]) {
      emit('equal', a[x]!);
      x += 1;
      y += 1;
    }
  }
}

function render(ops: DiffOp[], granularity: Granularity): string {
  if (granularity === 'line') {
    const lines: string[] = [];
    for (const op of ops) {
      const prefix = op.op === 'insert' ? '+ ' : op.op === 'delete' ? '- ' : '  ';
      for (const line of op.text.split('\n')) lines.push(prefix + line);
    }
    return lines.join('\n');
  }

  let out = '';
  for (const op of ops) {
    if (op.op === 'equal') out += op.text;
    else if (op.op === 'insert') out += `{+${op.text}+}`;
    else out += `[-${op.text}-]`;
  }
  return out;
}

function attempt(before: string, after: string, granularity: Granularity, mode: 'exact' | 'coarse'): Diff {
  const a = tokenize(before, granularity);
  const b = tokenize(after, granularity);
  const n = a.length;
  const m = b.length;

  const counts = (token: string): boolean => granularity !== 'word' || !/^\s+$/.test(token);
  const joiner = granularity === 'line' ? '\n' : '';

  const ops: DiffOp[] = [];
  let added = 0;
  let removed = 0;
  const emit: Emit = (op, token) => {
    if (op !== 'equal' && counts(token)) {
      if (op === 'insert') added += 1;
      else removed += 1;
    }
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += joiner + token;
    else ops.push({ op, text: token });
  };

  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const midA = a.slice(prefix, n - suffix);
  const midB = b.slice(prefix, m - suffix);

  for (let i = 0; i < prefix; i += 1) emit('equal', a[i]!);

  if (mode === 'exact') {
    const limit = Math.min(MAX_EDITS, Math.max(MIN_EDITS, Math.floor(COMPARISON_BUDGET / (midA.length + midB.length))));
    walkPath(midA, midB, findPath(midA, midB, limit), emit);
  } else {
    for (const token of midA) emit('delete', token);
    for (const token of midB) emit('insert', token);
  }

  for (let i = n - suffix; i < n; i += 1) emit('equal', a[i]!);

  const denominator = Math.max(a.filter(counts).length, b.filter(counts).length, 1);

  return {
    granularity,
    added,
    removed,
    changeRatio: Math.min(1, (added + removed) / denominator),
    ops,
    text: render(ops, granularity),
    ...(mode === 'coarse' ? { coarse: true as const } : {}),
  };
}

export function diffText(before: string, after: string, granularity: Granularity = 'word'): Diff {
  if (before === after) {
    const ops: DiffOp[] = before.length === 0 ? [] : [{ op: 'equal', text: before }];
    return { granularity, added: 0, removed: 0, changeRatio: 0, ops, text: render(ops, granularity) };
  }

  const stages: Granularity[] = granularity === 'line' ? ['line'] : [granularity, 'line'];
  for (const stage of stages) {
    try {
      return attempt(before, after, stage, 'exact');
    } catch (error) {
      if (!(error instanceof EditLimitExceeded)) throw error;
    }
  }
  return attempt(before, after, granularity, 'coarse');
}

export function boundedDiff(diff: Diff, maxBytes: number): Diff {
  if (Buffer.byteLength(JSON.stringify(diff), 'utf8') <= maxBytes) return diff;
  const { ops: _ops, text: _text, ...rest } = diff;
  return { ...rest, ops: [], text: '', truncated: true };
}

export interface JsonFieldChange {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface JsonDiff {
  granularity: 'json';
  fields: JsonFieldChange[];
  changeRatio: number;
  summary?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function diffJson(before: unknown, after: unknown): JsonDiff {
  const fields: JsonFieldChange[] = [];
  let total = 0;

  const walk = (path: string, a: unknown, b: unknown): void => {
    if (a === b) {
      if (a !== undefined) total += 1;
      return;
    }

    const bothObjects = isPlainObject(a) && isPlainObject(b);
    const bothArrays = Array.isArray(a) && Array.isArray(b);

    if (bothObjects) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) walk(path ? `${path}.${key}` : key, a[key], b[key]);
      return;
    }

    if (bothArrays) {
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i += 1) walk(`${path}.${i}`, a[i], b[i]);
      return;
    }

    total += 1;
    const change: JsonFieldChange = { path: path || '$' };
    if (a !== undefined) change.before = a;
    if (b !== undefined) change.after = b;
    fields.push(change);
  };

  walk('', before, after);

  return {
    granularity: 'json',
    fields,
    changeRatio: total === 0 ? 0 : Math.min(1, fields.length / total),
  };
}


const SUMMARY_PASSAGES = 3;
const SUMMARY_PASSAGE_CHARS = 80;
const SUMMARY_FIELDS = 5;

export function summarizeDiff(diff: Diff | JsonDiff): string {
  return diff.granularity === 'json' ? summarizeJsonDiff(diff) : summarizeTextDiff(diff);
}

function summarizeTextDiff(diff: Diff): string {
  if (diff.added === 0 && diff.removed === 0) return 'No change.';

  const unit = diff.added === 1 ? diff.granularity : `${diff.granularity}s`;
  const hedge = diff.coarse ? 'Up to ' : '';
  const lines = [`${hedge}${diff.added} ${unit} added, ${diff.removed} removed.`];

  for (const passage of changedPassages(diff.ops).slice(0, SUMMARY_PASSAGES)) {
    const label = passage.op === 'insert' ? 'Added' : 'Removed';
    lines.push(`${label}: "${clip(passage.text)}"`);
  }
  return lines.join('\n');
}

function changedPassages(ops: DiffOp[]): DiffOp[] {
  const passages: DiffOp[] = [];
  for (const op of ops) {
    if (op.op === 'equal') continue;
    const last = passages.at(-1);
    if (last && last.op === op.op) last.text += op.text;
    else passages.push({ op: op.op, text: op.text });
  }
  return passages
    .map((passage) => ({ op: passage.op, text: passage.text.replace(/\s+/g, ' ').trim() }))
    .filter((passage) => passage.text.length > 0);
}

function clip(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= SUMMARY_PASSAGE_CHARS) return text;
  return `${characters.slice(0, SUMMARY_PASSAGE_CHARS - 1).join('')}…`;
}

function summarizeJsonDiff(diff: JsonDiff): string {
  if (diff.fields.length === 0) return 'No change.';

  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const field of diff.fields) {
    const had = Object.hasOwn(field, 'before');
    const has = Object.hasOwn(field, 'after');
    if (had && has) changed.push(field.path);
    else if (has) added.push(field.path);
    else removed.push(field.path);
  }

  return [
    fieldSentence('Changed', changed),
    fieldSentence('Added', added),
    fieldSentence('Removed', removed),
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');
}

function fieldSentence(label: string, paths: string[]): string {
  if (paths.length === 0) return '';
  const named = paths.slice(0, SUMMARY_FIELDS).join(', ');
  const rest = paths.length - SUMMARY_FIELDS;
  return rest > 0 ? `${label}: ${named} and ${rest} more.` : `${label}: ${named}.`;
}
