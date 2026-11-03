// Food Standards Scotland (FSS) food and allergy alerts.
// Listing: https://www.foodstandards.gov.scot/alerts
//
// Most alerts on this page are the UK-wide FSA alerts (linked to alerts.food.gov.uk),
// which we already collect from the FSA. We only take the ones hosted on FSS's own site,
// which are Scotland-only. FSS has no data feed, so we read the public alerts page politely:
// one listing request per hourly run, then one request per new alert.

import type { AlertType, Recall } from './types.ts';
import { allergensIn, categoriesForFsa } from './categories.ts';
import { cleanText, getText, mapLimit, shorten, toIso, type FetchFn } from './util.ts';

export const FSS_BASE = 'https://www.foodstandards.gov.scot';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

export interface FssListing {
  url: string;
  slug: string;
  title: string;
  date: string | null; // ISO, if the listing shows one
}

/** Finds the Scotland-only alerts on the listing page. */
export function parseFssListing(html: string): FssListing[] {
  const found = new Map<string, FssListing>();
  const linkRe = /<a\b[^>]*href="((?:https:\/\/www\.foodstandards\.gov\.scot)?\/alerts\/([a-z0-9][a-z0-9-]{8,}))"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(linkRe)) {
    const slug = m[2];
    const title = cleanText(m[3]);
    if (!title || title.length < 12 || found.has(slug)) continue;
    // The date sits just before or after the link: take the closest one.
    const start = m.index!;
    const end = start + m[0].length;
    const from = Math.max(0, start - 400);
    let date: string | null = null;
    let best = Infinity;
    for (const d of html.slice(from, end + 400).matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})\\b`, 'g'))) {
      const at = from + d.index!;
      const distance = at < start ? start - at : at > end ? at - end : 0;
      if (distance < best) {
        best = distance;
        date = toIso(`${d[1]} ${d[2]} ${d[3]} 12:00 UTC`);
      }
    }
    found.set(slug, { url: m[1].startsWith('http') ? m[1] : `${FSS_BASE}${m[1]}`, slug, title, date });
  }
  return [...found.values()];
}

/** "Dunnet Bay Distillers recalls Rock Rose Gin ... because of undeclared sulphites" */
export function parseFssTitle(title: string): { business: string | null; product: string; reason: string | null } {
  const t = title.replace(/^(update\s*\d*:\s*)/i, '').replace(/^(allergy alert|food alert|product recall)[:\s-]+/i, '').trim();
  const m = t.match(/^(.+?)\s+recalls?\s+(.+?)(?:\s+(because|due to|as)\s+(.+))?$/i);
  if (!m) return { business: null, product: t, reason: null };
  return { business: m[1].trim(), product: m[2].trim(), reason: m[4] ? `${m[3]} ${m[4]}`.trim() : null };
}

function metaDescription(html: string): string | null {
  const m = html.match(/<meta[^>]+(?:name|property)="(?:description|og:description)"[^>]+content="([^"]*)"/i)
    ?? html.match(/<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="(?:description|og:description)"/i);
  return m ? cleanText(m[1]) : null;
}

/** The text under a heading such as "What to do" on an alert page. */
function sectionText(html: string, pattern: RegExp): string | null {
  const parts = html.split(/<h[23][^>]*>/i);
  for (const part of parts.slice(1)) {
    const [heading, ...rest] = part.split(/<\/h[23]>/i);
    if (pattern.test((cleanText(heading) ?? '').toLowerCase())) {
      const text = cleanText(rest.join(' ').split(/<h[1-3][^>]*>/i)[0]);
      if (text) return text;
    }
  }
  return null;
}

/** The publication date on an alert page, from a <time> tag or the first written date. */
function pageDate(html: string): string | null {
  const t = html.match(/<time[^>]+datetime="([^"]+)"/i)?.[1];
  if (t && !Number.isNaN(new Date(t).getTime())) return new Date(t).toISOString();
  const d = (cleanText(html) ?? '').match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})\\b`));
  return d ? toIso(`${d[1]} ${d[2]} ${d[3]} 12:00 UTC`) : null;
}

/** Converts one listing entry (plus its page, if we could read it) into our Recall format. */
export function normaliseFss(item: FssListing, page: string | null): Recall {
  const { business, product, reason } = parseFssTitle(item.title);
  const isAllergy = /^allergy-alert/.test(item.slug) || /undeclared|allerg/i.test(item.title);
  const alertType: AlertType = isAllergy ? 'allergy' : 'recall';
  const summary = page
    ? sectionText(page, /risk|problem|why|issue/) ?? metaDescription(page)
    : null;
  const advice = page ? sectionText(page, /what to do|action|advice/) : null;
  const batch = page ? sectionText(page, /product details|batch|best before|use by/) : null;
  const publishedAt = item.date ?? (page ? pageDate(page) : null) ?? new Date().toISOString();

  return {
    id: `fss:${item.slug.slice(0, 80)}`,
    source: 'fss',
    sourceRef: item.slug,
    alertType,
    title: item.title.replace(/^(update\s*\d*:\s*)/i, '').trim(),
    summary: shorten(summary ?? (reason ? `Recalled ${reason}.` : null)),
    advice: shorten(advice),
    riskLevel: null,
    categories: categoriesForFsa(item.title),
    allergens: allergensIn(item.title),
    businesses: business ? [business] : [],
    sourceUrl: item.url,
    documentUrl: null,
    imageUrl: null,
    publishedAt,
    updatedAt: publishedAt,
    products: [{
      name: product,
      barcode: null,
      packSize: null,
      batchCodes: [],
      bestBefore: null,
      useBy: null,
      batchNotes: shorten(batch, 400),
    }],
  };
}

/** Reads the FSS alerts page and returns Scotland-only alerts newer than `since`. */
export async function fetchFssSince(fetchFn: FetchFn, since: string): Promise<Recall[]> {
  const listing = parseFssListing(await getText(fetchFn, `${FSS_BASE}/alerts`));
  const fresh = listing.filter((i) => !i.date || new Date(i.date) >= new Date(new Date(since).getTime() - 86400_000));
  const pages = await mapLimit(fresh.slice(0, 20), 2, async (i) => {
    try { return await getText(fetchFn, i.url); } catch { return null; }
  });
  return fresh.slice(0, 20).map((item, idx) => normaliseFss(item, pages[idx]));
}
