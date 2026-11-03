// Health and Safety Executive (HSE) safety alerts and notices: faults in work equipment, protective
// gear and processes. Published as a table at hse.gov.uk/safetybulletins/recent-bulletins.htm
// (Date MM/YYYY | Topic | Bulletin No | Industry), each linking to a page with "Issue",
// "Outline of the problem" and "Action required" sections.
//
// Many are for offshore, chemical or other specialist industries, which aren't relevant to the app's
// users. We keep the ones a tradesperson, small business, school or household might meet.
// Licence: Open Government Licence v3.0 — attribution required.

import type { Recall } from './types.ts';
import { cleanText, getText, mapLimit, shorten, type FetchFn } from './util.ts';

export const HSE_BASE = 'https://www.hse.gov.uk/safetybulletins';

const SPECIALIST = /offshore|drilling|wind turbine|wind generation|marine|vessel|mooring|cargo|slop tank|radiograph|laborator|biological agent|nuclear|comah|refiner|mining|quarr|explosive|thermite|pesticide|oil and gas|gangway|grating|vapour recovery|motorsport|high voltage|switchgear|diving|pipeline|hydrogen sulphide|hydrogen sulfide/i;

export type HseRow = { month: string; url: string; slug: string; topic: string; bulletin: string | null; audience: string | null };

/** Rows of the recent bulletins table. `month` is "YYYY-MM". */
export function parseHseList(html: string): HseRow[] {
  const table = html.match(/<table[^>]*id="safetyalerts"[\s\S]*?<\/table>/i)?.[0] ?? html;
  const rows: HseRow[] = [];
  for (const row of table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 2) continue;
    const date = (cleanText(cells[0]) ?? '').match(/^(\d{1,2})\/(\d{4})$/);
    const link = cells[1].match(/href="([^"]+)"/)?.[1];
    if (!date || !link) continue;
    const url = link.startsWith('http') ? link : `${HSE_BASE}/${link.replace(/^\.?\//, '')}`;
    rows.push({
      month: `${date[2]}-${date[1].padStart(2, '0')}`,
      url,
      slug: (url.split('/').pop() ?? url).replace(/\.htm$/, ''),
      topic: cleanText(cells[1]) ?? '',
      bulletin: cleanText(cells[2]) || null,
      audience: cleanText(cells[3]) || null,
    });
  }
  return rows;
}

export function isRelevantHse(row: Pick<HseRow, 'topic' | 'audience'>): boolean {
  return !SPECIALIST.test(`${row.topic} ${row.audience ?? ''}`);
}

const END_OF_CONTENT = /^(guidance|relevant legal|further information|further guidance|related|is this page useful|footer|references?)/i;

/**
 * The text after a heading such as "Issue" or "Action required". With `throughSubheadings`, it carries
 * on past sub-headings ("Users should:", "Check", ...) until the guidance and references at the end.
 */
function sectionAfter(html: string, heading: RegExp, throughSubheadings = false): string | null {
  const parts = html.split(/(<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>)/i);
  for (let i = 1; i < parts.length; i += 2) {
    if (!heading.test(cleanText(parts[i]) ?? '')) continue;
    const pieces: string[] = [cleanText(parts[i + 1] ?? '') ?? ''];
    if (throughSubheadings) {
      for (let j = i + 2; j < parts.length; j += 2) {
        const h = cleanText(parts[j]) ?? '';
        if (END_OF_CONTENT.test(h)) break;
        pieces.push(h, cleanText(parts[j + 1] ?? '') ?? '');
      }
    }
    const text = pieces.filter(Boolean).join('\n').trim();
    if (text) return text;
  }
  return null;
}

export function normaliseHse(row: HseRow, html: string | null): Recall {
  const page = html ?? '';
  const main = page.match(/id="page-contents"[\s\S]*$/i)?.[0] ?? page;
  const kind = /safety alert/i.test(main.slice(0, 3000)) ? 'Safety alert' : 'Safety notice';
  const issueDate = cleanText(main.match(/Issue date:\s*([^<]+)/i)?.[1] ?? '')?.match(/(\d{1,2})\/(\d{2,4})/);
  const month = issueDate ? `${issueDate[2].length === 2 ? `20${issueDate[2]}` : issueDate[2]}-${issueDate[1].padStart(2, '0')}` : row.month;
  const publishedAt = new Date(`${month}-01T09:00:00Z`).toISOString();
  const issue = sectionAfter(main, /^issue$/i) ?? sectionAfter(main, /outline of the problem/i);
  const action = sectionAfter(main, /action required/i, true);
  return {
    id: `hse:${(row.bulletin ?? row.slug).replace(/[^A-Za-z0-9-]+/g, '-')}`,
    source: 'hse',
    sourceRef: row.bulletin ?? row.slug,
    alertType: 'safety-alert',
    title: row.topic,
    summary: shorten(issue ? `${kind}: ${issue}` : `${kind} from the Health and Safety Executive.`),
    advice: shorten(action, 400),
    riskLevel: kind === 'Safety alert' ? 'serious' : null,
    categories: ['trades-tools'],
    allergens: [],
    businesses: [],
    sourceUrl: row.url,
    documentUrl: null,
    imageUrl: null,
    publishedAt,
    updatedAt: publishedAt,
    products: [{
      name: row.topic, barcode: null, packSize: null, batchCodes: [], bestBefore: null, useBy: null,
      batchNotes: row.audience ? `Who it's for: ${row.audience}` : null,
    }],
  };
}

/** Relevant HSE alerts and notices from the month of `since` onwards. */
export async function fetchHseSince(fetchFn: FetchFn, since: string, maxItems = 20): Promise<Recall[]> {
  const fromMonth = since.slice(0, 7);
  const rows = parseHseList(await getText(fetchFn, `${HSE_BASE}/recent-bulletins.htm`))
    .filter((r) => r.month >= fromMonth && isRelevantHse(r))
    .slice(0, maxItems);
  const pages = await mapLimit(rows, 3, (r) => getText(fetchFn, r.url).catch(() => null));
  return rows.map((r, i) => normaliseHse(r, pages[i]));
}
