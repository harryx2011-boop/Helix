/// <reference lib="webworker" />
import Papa from 'papaparse';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { DocumentWorkerRequest, WorkerMessage } from '../types';
import type { DocumentOptions } from '../options';
import { DOC_MIME, docFamily, normalizeDocExt, type DocFormat } from '../documents';

declare const self: DedicatedWorkerGlobalScope;

/**
 * Documents convert through one of three intermediates, picked by the family
 * pair: rows (a Cell[][] grid), rich text (an HTML string), or a page. Every
 * supported pair is some route between those, which is why this worker has no
 * argv builder — the pipeline IS the pair.
 */
type Cell = string | number | boolean | null;
type Rows = Cell[][];

const post = (msg: WorkerMessage, transfer?: Transferable[]) =>
  transfer ? self.postMessage(msg, transfer) : self.postMessage(msg);

function progress(pct: number): void {
  post({ kind: 'progress', pct: Math.max(0, Math.min(99, Math.round(pct))), fps: 0, eta: null });
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** exceljs and pdf-lib are ~1.3 MB of the bundle between them; neither is
 *  touched unless a conversion actually needs a workbook or a page. */
async function excel() {
  return (await import('exceljs')).default;
}

// ── reading ──────────────────────────────────────────────────────────────

function readCsv(data: ArrayBuffer, o: DocumentOptions): Rows {
  const text = dec.decode(data);
  const result = Papa.parse<Cell[]>(text, {
    delimiter: o.delimiter ?? '',
    skipEmptyLines: 'greedy',
    dynamicTyping: true,
  });
  if (result.errors.length && result.data.length === 0) {
    throw new Error(result.errors[0]?.message ?? 'This CSV file could not be parsed.');
  }
  return result.data;
}

async function readWorkbook(data: ArrayBuffer, o: DocumentOptions): Promise<Rows> {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet =
    typeof o.sheet === 'string'
      ? wb.getWorksheet(o.sheet)
      : wb.worksheets[typeof o.sheet === 'number' ? o.sheet : 0];
  if (!sheet) throw new Error('That sheet is not in this workbook.');

  const rows: Rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // exceljs pads index 0 so column A lands at [1]; drop the hole.
    rows.push(values.slice(1).map(toCell));
  });
  return rows;
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // A formula cell, a hyperlink, or rich text: exceljs gives an object, and
  // the rendered result is the only part a CSV or a JSON row can carry.
  if (typeof value === 'object') {
    const v = value as { result?: unknown; text?: unknown; richText?: Array<{ text?: string }> };
    if (v.result !== undefined) return toCell(v.result);
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('');
  }
  return String(value);
}

function readJsonRows(data: ArrayBuffer): Rows {
  const parsed = parseJson(data);
  if (!Array.isArray(parsed)) {
    throw new Error('Only a JSON array of objects can become a table. This file is a single object or a value.');
  }
  if (parsed.length === 0) return [];
  const objects = parsed.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
  if (objects.length !== parsed.length) {
    throw new Error('Every item in the array has to be an object for this to become a table.');
  }
  const columns: string[] = [];
  for (const row of objects) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  return [columns, ...objects.map((row) => columns.map((c) => toCell(row[c])))];
}

function parseJson(data: ArrayBuffer): unknown {
  try {
    return JSON.parse(dec.decode(data));
  } catch (err) {
    throw new Error(`This file is not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * pdf.js is not used here. Pulling a full PDF renderer plus its own worker
 * into this worker to recover a plain-text approximation is a large cost for
 * a lossy result, and pdf-lib (already present for PDF *output*) cannot
 * extract text. So PDF input is read for its embedded text streams only, and
 * a PDF that has none — a scan — says so plainly rather than returning empty.
 */
async function readPdfText(data: ArrayBuffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(data), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (typeof item === 'object' && item && 'str' in item ? String((item as { str: string }).str) : ''))
      .join('');
    pages.push(text.trim());
    progress((i / doc.numPages) * 80);
  }
  const joined = pages.filter(Boolean).join('\n\n');
  if (!joined.trim()) {
    throw new Error('This PDF has no selectable text — it is probably a scan, which would need OCR rather than conversion.');
  }
  return joined;
}

// ── writing ──────────────────────────────────────────────────────────────

function writeCsv(rows: Rows, o: DocumentOptions): ArrayBuffer {
  const text = Papa.unparse(rows as unknown[][], { delimiter: o.delimiter ?? ',' });
  return bufferOf(text);
}

async function writeWorkbook(rows: Rows): Promise<ArrayBuffer> {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  for (const row of rows) sheet.addRow(row);
  if (rows.length > 1) sheet.getRow(1).font = { bold: true };
  // exceljs resolves its own Buffer-alike, not a plain ArrayBuffer, so it is
  // not transferable as-is — postMessage rejects it with "Value at index 0
  // does not have a transferable type". Normalise before it reaches the post.
  return normalize(await wb.xlsx.writeBuffer());
}

function writeJsonFromRows(rows: Rows, o: DocumentOptions): ArrayBuffer {
  const [header, ...body] = rows;
  if (!header) return bufferOf('[]');
  const keys = header.map((h, i) => (h === null || h === '' ? `column_${i + 1}` : String(h)));
  const objects = body.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? null])));
  return bufferOf(JSON.stringify(objects, null, o.indent ?? 2));
}

function rowsToHtml(rows: Rows, o: DocumentOptions): string {
  const [header, ...body] = rows;
  const cell = (c: Cell) => escapeHtml(c === null ? '' : String(c));
  const head =
    (o.header ?? true) && header
      ? `<thead><tr>${header.map((c) => `<th>${cell(c)}</th>`).join('')}</tr></thead>`
      : '';
  const rest = (o.header ?? true) ? body : rows;
  const tbody = `<tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table>${head}${tbody}</table>`;
}

function rowsToMarkdown(rows: Rows): string {
  if (rows.length === 0) return '';
  const cell = (c: Cell) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const [header, ...body] = rows;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: Cell[]) => Array.from({ length: width }, (_, i) => cell(r[i] ?? ''));
  const lines = [
    `| ${pad(header ?? []).join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function rowsToText(rows: Rows, o: DocumentOptions): string {
  const sep = o.delimiter && o.delimiter !== ',' ? o.delimiter : '\t';
  return rows.map((r) => r.map((c) => (c === null ? '' : String(c))).join(sep)).join('\n');
}

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

/**
 * Text → PDF, laid out by hand. pdf-lib draws strings at coordinates and has
 * no text flow, so wrapping, pagination and the baseline walk are this
 * function's job. Standard Helvetica only: embedding a font would mean
 * shipping one, and WinAnsi covers the Latin text these conversions produce.
 */
async function writePdf(text: string, o: DocumentOptions): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10;
  const leading = size * 1.45;
  const margin = 54;
  const landscape = o.orientation === 'landscape';
  const base = PAGE_SIZES[o.pageSize ?? 'a4'] ?? PAGE_SIZES.a4!;
  const [pw, ph] = landscape ? [base[1], base[0]] : base;
  const maxWidth = pw - margin * 2;

  // WinAnsi cannot encode every codepoint, and pdf-lib throws on the first it
  // cannot draw. Replacing them keeps a stray emoji or CJK run from failing
  // the whole conversion.
  const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?');

  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of safe(paragraph).split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A single word longer than the line gets hard-split rather than
      // overflowing off the page edge.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }

  let page = doc.addPage([pw, ph]);
  let y = ph - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage([pw, ph]);
      y = ph - margin;
    }
    if (line) page.drawText(line, { x: margin, y, size, font, color: rgb(0.07, 0.07, 0.08) });
    y -= leading;
  }
  const bytes = await doc.save();
  return toArrayBuffer(bytes);
}

// ── plumbing ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function bufferOf(text: string): ArrayBuffer {
  return toArrayBuffer(enc.encode(text));
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  // The view may be a window onto a larger pooled buffer; slice to exactly
  // the bytes, so the transferred ArrayBuffer is not silently oversized.
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/**
 * The single gate every payload passes before it is transferred. A library
 * may hand back a real ArrayBuffer, a typed-array view onto a pooled one, or
 * its own Buffer shim; only the first is transferable, and postMessage fails
 * at runtime rather than at compile time on the other two.
 */
function normalize(out: unknown): ArrayBuffer {
  if (out instanceof ArrayBuffer) return out;
  if (ArrayBuffer.isView(out)) return toArrayBuffer(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
  throw new Error('The converter produced output in a form it could not return.');
}

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.6 system-ui, -apple-system, sans-serif; margin: 2rem auto; max-width: 46rem; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d4d4dc; padding: 6px 10px; text-align: left; }
  th { background: #f4f4f7; }
</style>
${body}
</html>`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Rows for any table-family source. */
async function sourceRows(from: DocFormat, data: ArrayBuffer, o: DocumentOptions): Promise<Rows> {
  if (from === 'csv') return readCsv(data, o);
  if (from === 'xlsx' || from === 'xls') return readWorkbook(data, o);
  return readJsonRows(data);
}

async function run(req: DocumentWorkerRequest): Promise<void> {
  const from = normalizeDocExt(req.from);
  const to = normalizeDocExt(req.to);
  if (!from) throw new Error(`${req.from || 'That file'} is not a document format this converts.`);
  if (!to) throw new Error(`${req.to} is not a document format this converts.`);

  const o = req.options;
  progress(4);

  let buffer: ArrayBuffer;

  const fromFamily = docFamily(from);

  if (fromFamily === 'table') {
    const rows = await sourceRows(from, req.data, o);
    progress(55);
    if (to === 'csv') buffer = writeCsv(rows, o);
    else if (to === 'xlsx') buffer = await writeWorkbook(rows);
    else if (to === 'json') buffer = writeJsonFromRows(rows, o);
    else if (to === 'html') buffer = bufferOf(htmlDocument(req.name, rowsToHtml(rows, o)));
    else if (to === 'md') buffer = bufferOf(rowsToMarkdown(rows));
    else if (to === 'txt') buffer = bufferOf(rowsToText(rows, o));
    else if (to === 'xml') {
      const [header, ...body] = rows;
      const keys = (header ?? []).map((h, i) => String(h ?? `column_${i + 1}`).replace(/[^\w.-]/g, '_'));
      const items = body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
      buffer = bufferOf(new XMLBuilder({ format: true, indentBy: '  ' }).build({ rows: { row: items } }));
    } else if (to === 'pdf') {
      buffer = await writePdf(rowsToText(rows, o), o);
    } else throw new Error(`${from.toUpperCase()} cannot be converted to ${to.toUpperCase()}.`);
  } else if (fromFamily === 'page') {
    const text = await readPdfText(req.data);
    progress(88);
    if (to === 'txt') buffer = bufferOf(text);
    else if (to === 'md') buffer = bufferOf(text);
    else if (to === 'html') {
      const body = text
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('\n');
      buffer = bufferOf(htmlDocument(req.name, body));
    } else throw new Error(`A PDF can only become text, Markdown or HTML — not ${to.toUpperCase()}.`);
  } else {
    // text family: md / html / txt / xml
    const text = dec.decode(req.data);
    progress(40);

    if (from === 'xml') {
      const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(text);
      if (to === 'json') buffer = bufferOf(JSON.stringify(parsed, null, o.indent ?? 2));
      else if (to === 'txt') buffer = bufferOf(stripHtml(text));
      else if (to === 'html') buffer = bufferOf(htmlDocument(req.name, `<pre>${escapeHtml(text)}</pre>`));
      else if (to === 'pdf') buffer = await writePdf(stripHtml(text), o);
      else throw new Error(`XML cannot be converted to ${to.toUpperCase()}.`);
    } else if (from === 'md') {
      const html = await marked.parse(text, { async: true });
      if (to === 'html') buffer = bufferOf(htmlDocument(req.name, html));
      else if (to === 'txt') buffer = bufferOf(stripHtml(html));
      else if (to === 'pdf') buffer = await writePdf(stripHtml(html), o);
      else throw new Error(`Markdown cannot be converted to ${to.toUpperCase()}.`);
    } else if (from === 'html') {
      if (to === 'md') buffer = bufferOf(new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(text));
      else if (to === 'txt') buffer = bufferOf(stripHtml(text));
      else if (to === 'pdf') buffer = await writePdf(stripHtml(text), o);
      else throw new Error(`HTML cannot be converted to ${to.toUpperCase()}.`);
    } else {
      // txt
      if (to === 'md') buffer = bufferOf(text);
      else if (to === 'html') {
        const body = text
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
          .join('\n');
        buffer = bufferOf(htmlDocument(req.name, body));
      } else if (to === 'pdf') buffer = await writePdf(text, o);
      else throw new Error(`A text file cannot be converted to ${to.toUpperCase()}.`);
    }
  }

  const payload = normalize(buffer);
  post({ kind: 'done', data: payload, mime: DOC_MIME[to] }, [payload]);
}

self.onmessage = (event: MessageEvent<DocumentWorkerRequest>) => {
  void run(event.data).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'This document could not be converted.';
    post({ kind: 'error', message, stderr: '' });
  });
};
