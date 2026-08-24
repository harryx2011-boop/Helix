import { describe, expect, it } from 'vitest';
import { classifyFile, extensionOf } from './file-type.js';
import { ParseCache, contentHash } from './cache.js';

const PDF = Buffer.from('%PDF-1.4 rest');
const ZIP = Buffer.from('PK\x03\x04rest', 'latin1');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

describe('classifyFile', () => {
  it('trusts the bytes over a wrong content type', () => {
    expect(classifyFile({ bytes: PDF, contentType: 'text/plain', filename: 'x.txt' }).fileType).toBe('pdf');
    expect(classifyFile({ bytes: JPG, contentType: 'application/octet-stream' }).fileType).toBe('jpg');
  });

  it('uses the declared type, then the extension, for Office zip containers', () => {
    expect(classifyFile({ bytes: ZIP, contentType: 'application/msword', filename: 'x.bin' }).fileType).toBe('docx');
    expect(classifyFile({ bytes: ZIP, contentType: 'application/zip', filename: 'q.xlsx' }).fileType).toBe('xlsx');
    expect(classifyFile({ bytes: ZIP, contentType: 'application/zip', filename: 'q.zip' }).fileType).toBeUndefined();
  });

  it('refuses HTML with a pointer to /scrape', () => {
    const result = classifyFile({ bytes: Buffer.from('  <html><body>x</body></html>'), contentType: 'application/pdf' });
    expect(result.fileType).toBeUndefined();
    expect(result.reason).toContain('/v1/scrape');
  });

  it('falls back to the extension for unknown bytes', () => {
    expect(classifyFile({ bytes: Buffer.from('xxxx'), filename: 'photo.JPEG' }).fileType).toBe('jpg');
    expect(classifyFile({ bytes: Buffer.from('xxxx'), filename: 'notes.md' }).reason).toContain('supported:');
  });

  it('reads extensions past query strings', () => {
    expect(extensionOf('report.pdf?dl=1')).toBe('pdf');
    expect(extensionOf('archive')).toBeUndefined();
  });
});

describe('ParseCache', () => {
  it('keys on hash plus the options that change the output', () => {
    const hash = contentHash(PDF);
    expect(ParseCache.key(hash, { ocr: 'auto', maxPages: undefined })).toBe(`${hash}|ocr=auto`);
    expect(ParseCache.key(hash, { ocr: 'force' })).not.toBe(ParseCache.key(hash, { ocr: 'auto' }));
  });

  it('evicts the least recently used entry past its bound', () => {
    const cache = new ParseCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(2);
  });
});
