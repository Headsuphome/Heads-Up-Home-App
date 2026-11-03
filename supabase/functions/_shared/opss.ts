// Office for Product Safety and Standards (OPSS) product safety alerts, reports and recalls,
// published on GOV.UK. We use GOV.UK's public Search and Content APIs.
// Finder: https://www.gov.uk/product-safety-alerts-reports-recalls
// Licence: Open Government Licence v3.0 — attribution required.

import type { AlertType, Recall, RecallProduct, RiskLevel } from './types.ts';
import { categoriesForOpss } from './categories.ts';
import { asArray, cleanText, firstText, getJson, mapLimit, shorten, toIso, type FetchFn, type Json } from './util.ts';

export const GOVUK = 'https://www.gov.uk';
const FORMAT = 'product_safety_alert_report_recall';

function opssAlertTypeOf(slug: string | null | undefined): AlertType {
  const s = (slug ?? '').toLowerCase();
  if (s.includes('recall')) return 'recall';
  if (s.includes('alert')) return 'safety-alert';
  return 'safety-report';
}

function riskOf(value: string | null | undefined): RiskLevel {
  const v = (value ?? '').toLowerCase();
  if (v.includes('serious')) return 'serious';
  if (v.includes('high')) return 'high';
  if (v.includes('medium')) return 'medium';
  if (v.includes('low')) return 'low';
  return null;
}

/** Splits GOV.UK body HTML into { heading -> text } using its <h2> headings. */
export function sectionsOf(html: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = html.split(/<h2[^>]*>/i);
  for (const part of parts.slice(1)) {
    const [headingHtml, ...rest] = part.split(/<\/h2>/i);
    const heading = (cleanText(headingHtml) ?? '').toLowerCase();
    const text = cleanText(rest.join(' '));
    if (heading && text) sections.set(heading, text);
  }
  return sections;
}

/** Text of the first section whose heading matches, trying patterns in priority order. */
function findSection(sections: Map<string, string>, ...patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    for (const [heading, text] of sections) {
      if (pattern.test(heading)) return text;
    }
  }
  return null;
}

/** "Product Safety Report: Amdelne Tri-Proof Light (2609-0076)" -> name and ref. */
export function parseOpssTitle(title: string): { name: string; ref: string | null } {
  const ref = title.match(/\(([0-9]{4}-[0-9]{3,5})\)\s*$/)?.[1] ?? null;
  const name = title
    .replace(/\s*\([0-9]{4}-[0-9]{3,5}\)\s*$/, '')
    .replace(/^(product\s+(safety\s+)?(recall|report|alert))\s*:\s*/i, '')
    .trim();
  return { name: name || title, ref };
}

function productFromBody(name: string, html: string, sections: Map<string, string>): RecallProduct {
  const text = cleanText(html) ?? '';
  const barcode = text.match(/(?:barcode|EAN|GTIN)[^0-9]{0,30}(\d{8,14})/i)?.[1] ?? null;
  const batchSection = findSection(sections, /batch|model|identif/, /product details|product description/);
  const batchCodes = [...(batchSection ?? '').matchAll(/(?:batch|lot|model)(?:\s*(?:number|no\.?|code))?s?\s*[:\-]\s*([A-Z0-9][A-Z0-9\-\/\. ]{1,30})/gi)]
    .map((m) => m[1].trim().replace(/[\.\s]+$/, ''))
    .filter(Boolean);
  return {
    name,
    barcode,
    packSize: null,
    batchCodes: [...new Set(batchCodes)],
    bestBefore: null,
    useBy: null,
    batchNotes: shorten(batchSection, 400),
  };
}

/**
 * OPSS attaches a PDF ("Link to Product Image and PDF") to most notices; the product
 * photos are inside it. Occasionally an image is attached directly, which we use as-is.
 */
export function mediaOf(attachments: unknown, body: string): { documentUrl: string | null; imageUrl: string | null } {
  let documentUrl: string | null = null;
  let imageUrl: string | null = null;
  for (const a of asArray<Json>(attachments as Json)) {
    const url = typeof a?.url === 'string' ? a.url : null;
    if (!url) continue;
    const type = String(a.content_type ?? '').toLowerCase();
    if (!imageUrl && (type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(url))) imageUrl = url;
    if (!documentUrl && (type === 'application/pdf' || /\.pdf$/i.test(url))) documentUrl = url;
  }
  if (!documentUrl) {
    documentUrl = body.match(/href="(https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+\.pdf)"/i)?.[1] ?? null;
  }
  if (!imageUrl) {
    imageUrl = body.match(/<img[^>]+src="(https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+)"/i)?.[1] ?? null;
  }
  return { documentUrl, imageUrl };
}

/** Converts one GOV.UK content item into our Recall format. */
export function normaliseOpssItem(content: Json): Recall {
  const meta = content.details?.metadata ?? {};
  const body: string = content.details?.body ?? '';
  const sections = sectionsOf(body);
  const { name, ref: titleRef } = parseOpssTitle(content.title ?? '');
  const basePath: string = content.base_path ?? '';
  const ref = titleRef ?? basePath.match(/(\d{4}-\d{3,5})$/)?.[1] ?? content.content_id;

  const summary = shorten(cleanText(
    findSection(sections, /hazard/, /risk|what is the problem/) ?? content.description,
  ));
  const advice = shorten(cleanText(
    findSection(sections, /what should|what to do|consumer/, /corrective|action/),
  ));
  const categorySlug = firstText(meta.product_category);
  const publishedAt = toIso(meta.product_recall_alert_date ?? content.first_published_at);
  const { documentUrl, imageUrl } = mediaOf(content.details?.attachments, body);

  return {
    id: `opss:${ref}`,
    source: 'opss',
    sourceRef: ref,
    alertType: opssAlertTypeOf(firstText(meta.product_alert_type)),
    title: name,
    summary,
    advice,
    riskLevel: riskOf(firstText(meta.product_risk_level)),
    categories: categoriesForOpss(categorySlug, `${name} ${content.description ?? ''}`),
    allergens: [],
    businesses: [],
    sourceUrl: `${GOVUK}${basePath}`,
    documentUrl,
    imageUrl,
    publishedAt,
    updatedAt: toIso(content.public_updated_at, publishedAt),
    products: [productFromBody(name, body, sections)],
  };
}

/** Lists OPSS notices updated since `since`, then fetches each one's full content. */
export async function fetchOpssSince(fetchFn: FetchFn, since: string, maxItems = 300): Promise<Recall[]> {
  const fromDate = since.slice(0, 10); // GOV.UK search filters by whole days
  const links: string[] = [];
  const pageSize = 100;
  for (let start = 0; start < maxItems; start += pageSize) {
    const url = `${GOVUK}/api/search.json?filter_format=${FORMAT}` +
      `&filter_public_timestamp=from:${fromDate}&order=-public_timestamp` +
      `&count=${pageSize}&start=${start}&fields=link,public_timestamp`;
    const page = await getJson(fetchFn, url);
    const results = asArray<Json>(page.results);
    for (const r of results) {
      if (typeof r.link === 'string' && new Date(r.public_timestamp) >= new Date(since)) links.push(r.link);
    }
    if (results.length < pageSize) break;
  }

  const contents = await mapLimit(links, 5, (link) => getJson(fetchFn, `${GOVUK}/api/content${link}`));
  return contents
    .filter((c) => !(c.withdrawn_notice && Object.keys(c.withdrawn_notice).length))
    .map(normaliseOpssItem);
}
