/**
 * Text diff at word, line or character granularity.
 *
 * Myers' O((N+M)D) algorithm over token arrays. Pages differ in a handful of
 * places, so D stays small and a quadratic table is never built. The result is
 * a list of runs — equal, insert, delete — collapsed so consecutive tokens of
 * one kind form a single hunk with readable text.
 */

export type Granularity = 'word' | 'line' | 'character';

export interface DiffOp {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface Diff {
  granularity: Granularity;
  /** Tokens inserted and deleted, at the chosen granularity. */
  added: number;
  removed: number;
  /** Changed tokens over the larger side's token count. 0 when identical. */
  changeRatio: number;
  ops: DiffOp[];
  /** Line-oriented rendering with `+` / `-` / ` ` prefixes, for humans. */
  text: string;
}

export function tokenize(input: string, granularity: Granularity): string[] {
  if (input.length === 0) return [];
  switch (granularity) {
    case 'line':
      return input.split(/\r?\n/);
    case 'character':
      return Array.from(input);
    case 'word':
      // Keep the whitespace tokens so the diff can be re-joined verbatim.
      return input.split(/(\s+)/).filter((t) => t.length > 0);
  }
}

/** Myers' shortest-edit-script over two token arrays. */
function myers(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) return [];

  const offset = max;
  let v = new Array<number>(2 * max + 2).fill(0);
  const trace: number[][] = [];

  outer: for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
        x = v[offset + k + 1]!;
      } else {
        x = v[offset + k - 1]! + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }

  const ops: DiffOp[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d >= 0; d -= 1) {
    v = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      ops.push({ op: 'equal', text: a[x]! });
    }

    if (d > 0) {
      if (x === prevX) {
        y -= 1;
        ops.push({ op: 'insert', text: b[y]! });
      } else {
        x -= 1;
        ops.push({ op: 'delete', text: a[x]! });
      }
    }
  }

  ops.reverse();
  return ops;
}

function collapse(ops: DiffOp[], joiner: string): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.op === op.op) {
      last.text += joiner + op.text;
    } else {
      out.push({ op: op.op, text: op.text });
    }
  }
  return out;
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

  // Word and character diffs are rendered inline so a moved price reads as
  // `[-$29-]{+$34+}` rather than two full copies of the paragraph.
  let out = '';
  for (const op of ops) {
    if (op.op === 'equal') out += op.text;
    else if (op.op === 'insert') out += `{+${op.text}+}`;
    else out += `[-${op.text}-]`;
  }
  return out;
}

export function diffText(before: string, after: string, granularity: Granularity = 'word'): Diff {
  const a = tokenize(before, granularity);
  const b = tokenize(after, granularity);

  if (before === after) {
    return {
      granularity,
      added: 0,
      removed: 0,
      changeRatio: 0,
      ops: before.length === 0 ? [] : [{ op: 'equal', text: before }],
      text: render(before.length === 0 ? [] : [{ op: 'equal', text: before }], granularity),
    };
  }

  const raw = myers(a, b);

  // Whitespace tokens exist only so a word diff re-joins verbatim; they are
  // not counted as changes.
  const counts = (token: string): boolean => granularity !== 'word' || !/^\s+$/.test(token);

  let added = 0;
  let removed = 0;
  for (const op of raw) {
    if (!counts(op.text)) continue;
    if (op.op === 'insert') added += 1;
    else if (op.op === 'delete') removed += 1;
  }

  const joiner = granularity === 'line' ? '\n' : '';
  const ops = collapse(raw, joiner);
  const denominator = Math.max(a.filter(counts).length, b.filter(counts).length, 1);

  return {
    granularity,
    added,
    removed,
    changeRatio: Math.min(1, (added + removed) / denominator),
    ops,
    text: render(ops, granularity),
  };
}
