// Medicines and Healthcare products Regulatory Agency (MHRA): medicine recalls and
// device safety information, published on GOV.UK.
// Finder: https://www.gov.uk/drug-device-alerts
// Licence: Open Government Licence v3.0 — attribution required.
//
// We take two of the five message types:
//   medicines-recall-notification  e.g. "Class 2 Medicines Recall: Norgine ..., MOVICOL ..., EL(26)A/41"
//   device-safety-information       e.g. home blood-test strips, insulin pens
// Field safety notices, NHS patient safety alerts and safety roundups are aimed at
// hospitals and clinicians, so they're left out.

import type { Recall, RiskLevel } from './types.ts';
import { mentionsChildren } from './categories.ts';
import { GOVUK, mediaOf, sectionsOf } from './opss.ts';
import { asArray, cleanText, getJson, mapLimit, shorten, toIso, type FetchFn, type Json } from './util.ts';

export const MHRA_TYPES = ['medicines-recall-notification', 'device-safety-information'];

/** "Class 2 Medicines Recall: ..." -> 'high'. Class 1 is the most urgent. */
export function riskForClass(title: string): RiskLevel {
  const n = title.match(/\bclass\s*([1-4])\b/i)?.[1];
  return n === '1' ? 'serious' : n === '2' ? 'high' : n === '3' ? 'medium' : n === '4' ? 'low' : null;
}

/**
 * Splits a medicines recall title into its parts:
 * "Class 2 Medicines Recall: Norgine Limited, MOVICOL Plain 13.7g powder, EL(26)A/41"
 *  -> { company: "Norgine Limited", product: "MOVICOL Plain 13.7g powder", ref: "EL(26)A/41" }
 */
export function parseMhraTitle(title: string): { company: string | null; product: string; ref: string | null } {
  const colon = title.indexOf(':');
  const isRecall = /recall|notification|drug alert/i.test(title.slice(0, Math.max(colon, 0)));
  if (colon < 0 || !isRecall) {
    // Device safety information: "Nova Biomedical StatStrip ketone test strips: risk of ..."
    const product = (colon > 0 ? title.slice(0, colon) : title).trim();
    const ref = title.match(/\b(DSI\/\d{4}\/\d+)\b/i)?.[1] ?? null;
    return { company: null, product, ref };
  }
  const parts = title.slice(colon + 1).split(',').map((p) => p.trim()).filter(Boolean);
  let ref: string | null = null;
  if (parts.length && /^EL\s*\(\d+\)\s*[A-Z]\s*\/\s*\d+/i.test(parts[parts.length - 1])) ref = parts.pop()!;
  const company = parts.length > 1 ? parts.shift()! : null;
  return { company, product: parts.join(', ') || title, ref };
}

/** The raw HTML of the section whose heading matches, so tables can be read. */
function rawSection(html: string, pattern: RegExp): string | null {
  const parts = html.split(/<h2[^>]*>/i);
  for (const part of parts.slice(1)) {
    const [heading, ...rest] = part.split(/<\/h2>/i);
    if (pattern.test((cleanText(heading) ?? '').toLowerCase())) return rest.join(' ');
  }
  return null;
}

/** Batch numbers and expiry dates from the "Affected Lot Batch Numbers" table. */
export function batchesFrom(html: string): { batchCodes: string[]; expiry: string | null } {
  const section = rawSection(html, /batch|lot/);
  if (!section) return { batchCodes: [], expiry: null };
  const rows = [...section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cleanText(c[1]) ?? ''));
  if (!rows.length) return { batchCodes: [], expiry: null };
  const header = rows[0].map((h) => h.toLowerCase());
  const batchCol = Math.max(0, header.findIndex((h) => /batch|lot/.test(h)));
  const expiryCol = header.findIndex((h) => /expiry|exp\b|use by/.test(h));
  const body = rows.slice(1).filter((r) => r[batchCol]);
  const batchCodes = [...new Set(body.map((r) => r[batchCol]).filter((b) => /[A-Z0-9]/i.test(b)))];
  const expiries = expiryCol >= 0 ? [...new Set(body.map((r) => r[expiryCol]).filter(Boolean))] : [];
  return { batchCodes, expiry: expiries.length ? expiries.join(', ') : null };
}

function idFor(ref: string | null, basePath: string): string {
  if (ref) return `mhra:${ref.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}`;
  const slug = basePath.split('/').pop() ?? basePath;
  return `mhra:${slug.slice(-60)}`;
}

/** Converts one GOV.UK MHRA alert into our Recall format. */
export function normaliseMhraItem(content: Json): Recall {
  const meta = content.details?.metadata ?? {};
  const body: string = content.details?.body ?? '';
  const sections = sectionsOf(body);
  const title: string = cleanText(content.title) ?? '';
  const alertType = String(meta.alert_type ?? '');
  const isDevice = alertType === 'device-safety-information';
  const { company, product, ref } = parseMhraTitle(title);
  const { batchCodes, expiry } = batchesFrom(body);

  const findSection = (...patterns: RegExp[]) => {
    for (const p of patterns) for (const [h, t] of sections) if (p.test(h)) return t;
    return null;
  };
  const advice = findSection(/advice for patients|to provide to patients|advice for the public|patients and carers/);
  const publishedAt = toIso(meta.issued_date ?? content.first_published_at);
  const basePath: string = content.base_path ?? '';
  const { documentUrl } = mediaOf(content.details?.attachments, body);

  return {
    id: idFor(ref, basePath),
    source: 'mhra',
    sourceRef: ref ?? basePath.split('/').pop() ?? '',
    alertType: isDevice ? 'safety-alert' : 'recall',
    title: isDevice ? title : product,
    summary: shorten(cleanText(content.description) ?? findSection(/summary|background/)),
    advice: shorten(advice ?? null, 400),
    riskLevel: isDevice ? null : riskForClass(title),
    categories: mentionsChildren(title) ? ['medicines', 'baby-children'] : ['medicines'],
    allergens: [],
    businesses: company ? [company] : [],
    sourceUrl: `${GOVUK}${basePath}`,
    documentUrl,
    imageUrl: null,
    publishedAt,
    updatedAt: toIso(content.public_updated_at, publishedAt),
    products: [{
      name: product,
      barcode: null,
      packSize: null,
      batchCodes,
      bestBefore: expiry ? `Expiry: ${expiry}` : null,
      useBy: null,
      batchNotes: null,
    }],
  };
}

/** Lists MHRA medicine recalls and device safety information since `since`, then reads each one. */
export async function fetchMhraSince(fetchFn: FetchFn, since: string, maxItems = 100): Promise<Recall[]> {
  const fromDate = since.slice(0, 10);
  const links = new Set<string>();
  for (const type of MHRA_TYPES) {
    const url = `${GOVUK}/api/search.json?filter_format=medical_safety_alert&filter_alert_type=${type}` +
      `&filter_public_timestamp=from:${fromDate}&order=-public_timestamp&count=${maxItems}&fields=link,public_timestamp`;
    const page = await getJson(fetchFn, url);
    for (const r of asArray<Json>(page.results)) {
      if (typeof r.link === 'string' && new Date(r.public_timestamp) >= new Date(since)) links.add(r.link);
    }
  }
  const contents = await mapLimit([...links], 5, (link) => getJson(fetchFn, `${GOVUK}/api/content${link}`));
  return contents
    .filter((c) => !(c.withdrawn_notice && Object.keys(c.withdrawn_notice).length))
    .filter((c) => MHRA_TYPES.includes(String(c.details?.metadata?.alert_type ?? '')))
    .map(normaliseMhraItem);
}

