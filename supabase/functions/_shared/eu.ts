// EU Safety Gate: dangerous non-food products reported by EU countries, published every Friday as an
// XML weekly report. Many of these products are sold online in the UK too, so the app shows them as
// "EU warnings", clearly separate from UK recalls. They only trigger alerts for barcode or cupboard
// matches, never for categories.
// Weekly report list: https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/list/xml/en
// Licence: the weekly reports are published as open data (CC0 on data.europa.eu); credit the
// European Commission's Safety Gate.

import type { Recall } from './types.ts';
import { categoriesForOpss } from './categories.ts';
import { getText, getTextUntil, isPermanent, mapLimit, shorten, type FetchFn } from './util.ts';

export const EU_LIST = 'https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/list/xml/en';

/** Product types we leave out: vehicles are handled by national schemes, not useful here. */
const SKIP_CATEGORIES = /motor vehicles|recreational craft/i;

export type EuReport = { reference: string; date: string; url: string };

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return null;
  const value = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
  return decode(value) || null;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");
}

const REPORT_ENTRY = /<weeklyReport>([\s\S]*?)<\/weeklyReport>/g;

function reportFrom(entry: string): EuReport | null {
  const y = tag(entry, 'year'), mo = tag(entry, 'month'), d = tag(entry, 'day');
  const url = tag(entry, 'URL');
  if (!y || !mo || !d || !url) return null;
  return { reference: tag(entry, 'reference') ?? `${y}-${mo}-${d}`, date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, url };
}

/** All weekly reports, oldest first. */
export function parseEuReportList(xml: string): EuReport[] {
  return [...xml.matchAll(REPORT_ENTRY)]
    .map((m) => reportFrom(m[1]))
    .filter((r): r is EuReport => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The full list goes back to 2005 and is newest first, so we only read its top: up to the second
 * report older than `cutoff` (two, in case one report has a misprinted date).
 */
export function listReaches(cutoff: string): (text: string) => boolean {
  return (text) => {
    let older = 0;
    for (const m of text.matchAll(REPORT_ENTRY)) {
      const r = reportFrom(m[1]);
      if (r && r.date < cutoff && ++older >= 2) return true;
    }
    return false;
  };
}

/** How far back the list is read: a little more than the two years of history the backfill loads. */
const LIST_DAYS = 760;
const LIST_FRESH_MS = 15 * 60_000;
const listCache = new WeakMap<FetchFn, { at: number; readTo: string; reports: EuReport[] }>();

/**
 * Weekly reports dated `cutoff` or later, oldest first. The list is read once per run and shared
 * by the everyday check and the history loader.
 */
export async function euReportsSince(fetchFn: FetchFn, cutoff: string, now = Date.now()): Promise<EuReport[]> {
  let cached = listCache.get(fetchFn);
  if (!cached || now - cached.at > LIST_FRESH_MS || cached.readTo > cutoff) {
    const depth = new Date(now - LIST_DAYS * 86400_000).toISOString().slice(0, 10);
    const readTo = cutoff < depth ? cutoff : depth;
    const reports = parseEuReportList(await getTextUntil(fetchFn, EU_LIST, listReaches(readTo)));
    cached = { at: now, readTo, reports };
    listCache.set(fetchFn, cached);
  }
  return cached.reports.filter((r) => r.date >= cutoff);
}

/** "Category of measure(s): Recall of the product from end users" → "Recall of the product from end users". */
export function euMeasures(text: string | null): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(/Category of measure\(s\):\s*(.*?)(?=Date of entry into force:|Type of economic operator|$)/gs)]
    .map((m) => m[1].trim()).filter(Boolean))];
}

function euCategories(category: string, text: string) {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return categoriesForOpss(slug, text);
}

/** Converts one notification from a weekly report. Returns null for ones we leave out. */
export function normaliseEuNotification(xml: string, reportDate: string): Recall | null {
  const category = tag(xml, 'category') ?? '';
  if (SKIP_CATEGORIES.test(category)) return null;
  if ((tag(xml, 'type') ?? 'Consumer') !== 'Consumer') return null;
  const caseNumber = tag(xml, 'caseNumber');
  const reference = tag(xml, 'reference');
  if (!caseNumber || !reference) return null;
  const product = tag(xml, 'product') ?? category;
  const brand = tag(xml, 'brand');
  const name = tag(xml, 'name');
  const model = tag(xml, 'type_numberOfModel');
  const barcodes = (tag(xml, 'barcode') ?? '').split(/[,;\s/]+/).map((b) => b.replace(/\D/g, '')).filter((b) => b.length >= 8 && b.length <= 14);
  const batch = (tag(xml, 'batchNumber') ?? '').split(/[,;]+/).map((b) => b.trim()).filter(Boolean);
  const risk = tag(xml, 'riskType');
  const danger = tag(xml, 'danger');
  const level = tag(xml, 'level');
  const country = tag(xml, 'notifyingCountry');
  const measures = euMeasures(tag(xml, 'measures'));
  const pictures = [...xml.matchAll(/<picture>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/picture>/g)].map((m) => m[1].trim());
  const sold = tag(xml, 'onlineTrader');
  const title = [brand, name && name !== product ? name : null].filter(Boolean).join(' ') || product;
  const publishedAt = new Date(`${reportDate}T12:00:00Z`).toISOString();
  const text = [category, product, name, tag(xml, 'description')].filter(Boolean).join(' ');

  const intro = `Reported as dangerous in the EU${country ? ` by ${country}` : ''}${risk ? ` (${risk.toLowerCase()})` : ''}.`;
  const advice = [
    measures.length ? `Action taken in the EU: ${measures.join('; ')}.` : null,
    "If you have this product, stop using it and contact the seller. It may also have been sold in the UK, especially online.",
  ].filter(Boolean).join(' ');

  return {
    id: `eu:${caseNumber.replace(/[^A-Za-z0-9]+/g, '-')}`,
    source: 'eu',
    sourceRef: caseNumber,
    alertType: 'eu-warning',
    title: product !== title && !title.toLowerCase().includes(product.toLowerCase()) ? `${title} (${product.toLowerCase()})` : title,
    summary: shorten(`${intro} ${danger ?? ''}`.trim()),
    advice: shorten(advice, 400),
    riskLevel: /serious/i.test(level ?? '') ? 'serious' : /high/i.test(level ?? '') ? 'high' : /medium/i.test(level ?? '') ? 'medium' : /low/i.test(level ?? '') ? 'low' : null,
    categories: euCategories(category, text),
    allergens: [],
    businesses: [brand, sold && !/^other/i.test(sold) ? sold.replace(/\s*\/\s*$/, '') : null].filter((b): b is string => !!b),
    sourceUrl: reference,
    documentUrl: null,
    imageUrl: pictures[0] ?? null,
    publishedAt,
    updatedAt: publishedAt,
    products: [{
      name: [brand, name ?? product].filter(Boolean).join(' '),
      barcode: barcodes[0] ?? null,
      packSize: null,
      batchCodes: batch,
      bestBefore: null,
      useBy: null,
      batchNotes: [model ? `Model: ${model}` : null, barcodes.length > 1 ? `Barcodes: ${barcodes.join(', ')}` : null].filter(Boolean).join('\n') || null,
    }],
  };
}

export function parseEuReport(xml: string, reportDate: string): Recall[] {
  return [...xml.matchAll(/<notifications\b[\s\S]*?<\/notifications>/g)]
    .map((m) => normaliseEuNotification(m[0], reportDate))
    .filter((r): r is Recall => r !== null);
}

/**
 * Downloads weekly reports (oldest first), two at a time. If one fails, the batch stops just before it,
 * so it's tried again next run rather than skipped; if the first one fails, this throws.
 * A report the server says doesn't exist (404 and the like) is passed over.
 */
export async function fetchEuReports(fetchFn: FetchFn, reports: EuReport[]): Promise<{ recalls: Recall[]; fetched: number }> {
  const results = await mapLimit(reports, 2, (r) =>
    getText(fetchFn, r.url).then((xml) => ({ xml }), (error: unknown) => (isPermanent(error) ? { xml: '' } : { error })));
  const failed = results.findIndex((r) => 'error' in r);
  if (failed === 0) throw (results[0] as { error: unknown }).error;
  const fetched = failed < 0 ? reports.length : failed;
  const recalls = reports.slice(0, fetched).flatMap((r, i) => parseEuReport((results[i] as { xml: string }).xml, r.date));
  return { recalls, fetched };
}

/** Weekly reports published since `since` (at most `maxReports`, newest). */
export async function fetchEuSince(fetchFn: FetchFn, since: string, maxReports = 6): Promise<Recall[]> {
  const reports = (await euReportsSince(fetchFn, since.slice(0, 10))).slice(-maxReports);
  return (await fetchEuReports(fetchFn, reports)).recalls;
}
