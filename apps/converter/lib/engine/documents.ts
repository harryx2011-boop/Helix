/**
 * Document formats, and which pairs the document worker can actually do.
 *
 * Unlike video/audio/image — where any decodable input can reach any
 * encodable output because everything meets in the middle as frames or
 * samples — documents have no universal intermediate. A spreadsheet is rows,
 * a Markdown file is a tree, a PDF is a page description, and only some of
 * those lower into each other without inventing data. So the matrix here is
 * explicit rather than derived: a pair exists only if there is a real,
 * non-lossy-in-a-surprising-way path for it.
 */

export const TABLE_FORMATS = ['csv', 'xlsx', 'xls', 'json'] as const;
export const TEXT_FORMATS = ['md', 'html', 'txt', 'xml'] as const;
export const PAGE_FORMATS = ['pdf'] as const;

export const DOC_FORMATS = [...TABLE_FORMATS, ...TEXT_FORMATS, ...PAGE_FORMATS] as const;

export type DocFormat = (typeof DOC_FORMATS)[number];

/** What the document worker groups a format as, which decides the pipeline. */
export type DocFamily = 'table' | 'text' | 'page';

const DOC_SET = new Set<string>(DOC_FORMATS);

export function isDocFormat(value: string): value is DocFormat {
  return DOC_SET.has(value);
}

export function docFamily(format: DocFormat): DocFamily {
  if ((TABLE_FORMATS as readonly string[]).includes(format)) return 'table';
  if ((PAGE_FORMATS as readonly string[]).includes(format)) return 'page';
  return 'text';
}

export const DOC_MIME: Record<DocFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  json: 'application/json',
  md: 'text/markdown',
  html: 'text/html',
  txt: 'text/plain',
  xml: 'application/xml',
  pdf: 'application/pdf',
};

/**
 * `xls` is read-only. SheetJS's BIFF8 writer is not in the maintained
 * ExcelJS line, and emitting a 1997 binary format nobody asks for as an
 * *output* is not worth a second spreadsheet dependency — an .xls file
 * converts to .xlsx or .csv perfectly well.
 *
 * `pdf` is likewise read-only for text extraction and write-only from text:
 * see DOC_TARGETS. There is no pdf → xlsx, because a PDF table is a visual
 * arrangement of glyphs, and reconstructing cells from it is a heuristic
 * that quietly produces wrong numbers.
 */
export const DOC_INPUT_ONLY: readonly DocFormat[] = ['xls'] as const;

/**
 * The real matrix: source format → the targets the worker can produce.
 *
 * Table formats interconvert freely (they all lower to rows). Text formats
 * interconvert through a markdown/HTML pair. PDF is a one-way street in each
 * direction — text out of a PDF, or a PDF rendered from text — and never a
 * round trip, because neither direction preserves the other's structure.
 */
export const DOC_TARGETS: Record<DocFormat, readonly DocFormat[]> = {
  // Rows in, rows out. PDF is included because a table renders to a page
  // deterministically, which is the one document→page path that is honest.
  csv: ['xlsx', 'json', 'html', 'md', 'txt', 'pdf'],
  xls: ['csv', 'xlsx', 'json', 'html', 'md', 'txt', 'pdf'],
  xlsx: ['csv', 'json', 'html', 'md', 'txt', 'pdf'],
  // JSON reaches the table formats only when it is an array of flat objects;
  // the worker checks and gives a plain-language error when it is not.
  json: ['csv', 'xlsx', 'xml', 'txt', 'html', 'md', 'pdf'],

  md: ['html', 'txt', 'pdf'],
  html: ['md', 'txt', 'pdf'],
  txt: ['md', 'html', 'pdf'],
  xml: ['json', 'txt', 'html', 'pdf'],

  // Text extraction only. Not xlsx/csv — see DOC_INPUT_ONLY.
  pdf: ['txt', 'md', 'html'],
};

export function docTargetsFor(source: string): readonly DocFormat[] {
  const ext = normalizeDocExt(source);
  if (!ext) return [];
  return DOC_TARGETS[ext];
}

/** `.markdown`, `.htm` and `.yml`-style aliases map onto their canonical ext. */
const DOC_ALIASES: Record<string, DocFormat> = {
  markdown: 'md',
  mdown: 'md',
  htm: 'html',
  text: 'txt',
  log: 'txt',
};

export function normalizeDocExt(ext: string): DocFormat | null {
  const lower = ext.toLowerCase().replace(/^\./, '');
  if (isDocFormat(lower)) return lower;
  return DOC_ALIASES[lower] ?? null;
}

/** Every extension the file picker should accept for the Document tab. */
export const DOC_INPUT_EXTS: string[] = [...DOC_FORMATS, ...Object.keys(DOC_ALIASES)];
