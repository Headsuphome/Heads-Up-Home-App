// Product photos. The FSA and OPSS publish their photos inside a PDF attached to each
// notice, not as normal images. Photos in PDFs are almost always stored as plain JPEG
// data, so we can lift the biggest one out without rendering the PDF.

import type { FetchFn } from './util.ts';

const enc = new TextEncoder();
const STREAM = enc.encode('stream');
const ENDSTREAM = enc.encode('endstream');

function indexOf(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  const first = needle[0];
  const last = hay.length - needle.length;
  for (let i = from; i <= last; i++) {
    if (hay[i] !== first) continue;
    let j = 1;
    while (j < needle.length && hay[i + j] === needle[j]) j++;
    if (j === needle.length) return i;
  }
  return -1;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = Math.max(0, start); i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/**
 * Finds every JPEG photo stored in a PDF. Skips images that aren't plain JPEG (for example
 * compressed twice), CMYK images (they show up with wrong colours in phones), and tiny ones.
 */
export function jpegsInPdf(pdf: Uint8Array, minSide = 120): PdfImage[] {
  const found: PdfImage[] = [];
  let pos = 0;
  while (pos < pdf.length) {
    const s = indexOf(pdf, STREAM, pos);
    if (s < 0) break;
    // Skip "endstream", which also contains "stream".
    const isEnd = s >= 3 && ascii(pdf, s - 3, s) === 'end';
    let dataStart = s + STREAM.length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    pos = s + STREAM.length;
    if (isEnd) continue;

    // The stream's description sits just before the word "stream".
    const dict = ascii(pdf, s - 1500, s);
    const dictStart = dict.lastIndexOf('<<');
    const header = dictStart >= 0 ? dict.slice(dictStart) : dict;
    if (!/\/Subtype\s*\/Image/.test(header) || !/\/DCTDecode/.test(header)) continue;
    if (/\/FlateDecode/.test(header) || /\/DeviceCMYK/.test(header)) continue;
    if (pdf[dataStart] !== 0xff || pdf[dataStart + 1] !== 0xd8) continue;

    const e = indexOf(pdf, ENDSTREAM, dataStart);
    if (e < 0) break;
    // The JPEG ends at its last FF D9 marker before "endstream".
    let end = -1;
    for (let i = e - 1; i > dataStart + 1 && i > e - 16; i--) {
      if (pdf[i - 1] === 0xff && pdf[i] === 0xd9) { end = i + 1; break; }
    }
    pos = e + ENDSTREAM.length;
    if (end < 0) continue;

    const width = Number(header.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
    const height = Number(header.match(/\/Height\s+(\d+)/)?.[1] ?? 0);
    if (width && height && Math.min(width, height) < minSide) continue;
    found.push({ jpeg: pdf.slice(dataStart, end), width, height });
  }
  return found;
}

/** The biggest photo in the PDF: product photos are larger than logos and icons. */
export function bestPhoto(pdf: Uint8Array): PdfImage | null {
  const all = jpegsInPdf(pdf);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.width * b.height || b.jpeg.length) > (a.width * a.height || a.jpeg.length) ? b : a);
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function downloadPdf(fetchFn: FetchFn, url: string): Promise<Uint8Array | null> {
  const res = await fetchFn(url, { headers: { 'User-Agent': 'HeadsUpHome/1.0 (recall alerts)' } });
  if (!res.ok) return null;
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_PDF_BYTES) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES || ascii(bytes, 0, 5) !== '%PDF-') return null;
  return bytes;
}

/** A safe file name for a recall id like "fsa:FSA-PRIN-45-2026". */
export const imagePath = (recallId: string) => `${recallId.replace(/[^A-Za-z0-9-]+/g, '_')}.jpg`;
