/**
 * Decide what kind of file a parse request carries.
 *
 * Content-type headers lie often enough (generic `application/octet-stream`
 * from object stores, `text/plain` from misconfigured CDNs) that the bytes get
 * the final word where they can: a PDF starts with `%PDF`, PNG and JPEG have
 * fixed signatures. Office files are all zip containers, so they fall back to
 * the declared type and then the filename extension.
 */

export type FileType = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpg';

export const FILE_TYPES: readonly FileType[] = ['pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpg'];

/** The content type helix-extract expects for each file kind. */
export const CONTENT_TYPE_FOR: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
};

const BY_CONTENT_TYPE: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};

const BY_EXTENSION: Record<string, FileType> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  pptx: 'pptx',
  ppt: 'pptx',
  xlsx: 'xlsx',
  xls: 'xlsx',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
};

function sniff(bytes: Buffer): FileType | 'zip' | 'html' | undefined {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  const head = bytes.subarray(0, 512).toString('latin1').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  return undefined;
}

export function extensionOf(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const base = filename.split(/[?#]/)[0] ?? '';
  const dot = base.lastIndexOf('.');
  if (dot === -1 || dot === base.length - 1) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

export interface Classification {
  fileType?: FileType | undefined;
  /** Why it could not be classified, for the failure detail. */
  reason?: string | undefined;
}

export function classifyFile(input: {
  bytes: Buffer;
  contentType?: string | undefined;
  filename?: string | undefined;
}): Classification {
  const declared = input.contentType?.split(';', 1)[0]?.trim().toLowerCase();
  const fromHeader = declared ? BY_CONTENT_TYPE[declared] : undefined;
  const fromExtension = BY_EXTENSION[extensionOf(input.filename) ?? ''];
  const signature = sniff(input.bytes);

  const htmlPage = { reason: 'the source is an HTML page, not a document; use /v1/scrape for web pages' };

  if (signature === 'html') return htmlPage;

  if (signature === 'pdf' || signature === 'png' || signature === 'jpg') {
    return { fileType: signature };
  }

  if (signature === 'zip') {
    // Office containers: the bytes cannot tell docx from pptx; the declared
    // type or the name has to.
    const office = [fromHeader, fromExtension].find((t) => t === 'docx' || t === 'pptx' || t === 'xlsx');
    if (office) return { fileType: office };
    return {
      reason: 'a zip container with no recognisable Office type; send a .docx, .pptx or .xlsx name or content type',
    };
  }

  // Only now does the declared type get a say: a PDF served as text/html by a
  // misconfigured server was already recognised from its bytes above.
  if (declared === 'text/html') return htmlPage;

  if (fromHeader) return { fileType: fromHeader };
  if (fromExtension) return { fileType: fromExtension };

  return {
    reason: declared
      ? `unsupported content type ${declared}; supported: ${FILE_TYPES.join(', ')}`
      : `could not determine the file type; supported: ${FILE_TYPES.join(', ')}`,
  };
}
