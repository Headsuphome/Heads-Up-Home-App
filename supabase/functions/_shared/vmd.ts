// Veterinary Medicines Directorate (VMD): recalls of animal medicines, published on GOV.UK as news stories.
// Titles vary: "Product defect recall alert: X", "X - product defect recall alert", "Batch recall alert for X",
// "Batch recall - X", "X recall alert".
// Most notices are short letters: "We wish to inform veterinarians that <company> has initiated a Class II
// recall of X due to <reason>." The batches follow as a table (Batch number | Expiry date, sometimes with a
// Product column), a list, or a line such as "Bulk Batch Number: 5E10".
// Example: https://www.gov.uk/government/news/batch-recall-kelactin-and-pgf-veyx-forte
// Licence: Open Government Licence v3.0 — attribution required.
//
// Withdrawn alerts (the VMD withdraws them once a recall is over) are skipped.

import type { Recall } from './types.ts';
import { GOVUK, mediaOf, sectionsOf } from './opss.ts';
import { asArray, cleanText, getJson, mapLimit, shorten, toIso, type FetchFn, type Json } from './util.ts';

const VMD_ORG = 'veterinary-medicines-directorate';

/** True for the VMD's recall notices, as opposed to its other news. */
export function isVmdRecallTitle(title: string): boolean {
  return /\brecall/i.test(title);
}

const TITLE_WORDS = String.raw`(?:product (?:defect )?recall(?: alert)?|batch recall(?: alert)?|recall alert|product recall)`;
const TITLE_START = new RegExp(String.raw`^\s*${TITLE_WORDS}\s*(?::|for\b|-|–)?\s*`, 'i');
const TITLE_END = new RegExp(String.raw`\s*(?:-|–|:)?\s*${TITLE_WORDS}\s*$`, 'i');

/** The product's name from the notice title, without the "recall alert" wording. */
export function vmdProductName(title: string): string {
  const name = title.replace(/^\s*\[withdrawn\]\s*/i, '').replace(TITLE_START, '').replace(TITLE_END, '').trim();
  return name || title.trim();
}

/**
 * "Label: value" pairs from a notice, whether written as two-column table rows or as lines
 * such as "Bulk Batch Number: 5E10". Labels are lower case.
 */
export function vmdFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  const add = (label: string, value: string) => {
    const key = label.toLowerCase().replace(/[:\s]+$/, '').trim();
    if (key && value && key.length <= 60 && !fields.has(key)) fields.set(key, value.trim());
  };
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cleanText(c[1]) ?? '');
    if (cells.length === 2) add(cells[0], cells[1]);
  }
  for (const line of textLines(html)) {
    const m = line.match(/^([A-Za-z][A-Za-z ()/'’-]{1,50}):\s*(\S.*)$/);
    if (m) add(m[1], m[2]);
  }
  return fields;
}

function fieldLike(fields: Map<string, string>, pattern: RegExp, not?: RegExp): string[] {
  return [...fields].filter(([k]) => pattern.test(k) && !(not && not.test(k))).map(([, v]) => v);
}

/** The notice's text outside tables, one paragraph, list item or line per entry. */
function textLines(html: string): string[] {
  return (cleanText(html.replace(/<table[\s\S]*?<\/table>/gi, '\n')) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

function sentencesOf(html: string): string[] {
  return textLines(html).join(' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asSentence = (s: string) => capitalise(s.trim()).replace(/[.;:,\s]*$/, '.');

/** A batch code: letters and digits, at least one digit, and not just a year. */
function asBatchCode(token: string | undefined): string | null {
  const t = (token ?? '').trim().replace(/[.,;:)]+$/, '');
  if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/i.test(t) || !/\d/.test(t) || /^(19|20)\d\d$/.test(t)) return null;
  return t;
}

function expiryIn(text: string): string | null {
  const m = text.match(/expir\w*(?:\s+date)?(?:\s+(?:of|is))?\s*[:\-–]?\s*([0-9]{1,2}(?:\s*[A-Za-z]+|\/[0-9]{1,2})?[\s/]*[0-9]{2,4}|[A-Za-z]+\s+[0-9]{4})/i);
  return m ? m[1].trim() : null;
}

export type VmdBatch = { product: string | null; batch: string; expiry: string | null };

/** Batches from any table with a "Batch" or "Lot" column (and maybe Product and Expiry columns). */
export function vmdTableBatches(html: string): VmdBatch[] {
  const out: VmdBatch[] = [];
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
      [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cleanText(c[1]) ?? ''));
    if (rows.length < 2) continue;
    const header = rows[0].map((h) => h.toLowerCase());
    const b = header.findIndex((h) => /batch|lot/.test(h));
    if (b < 0) continue;
    const e = header.findIndex((h) => /expiry|exp\b|use by/.test(h));
    const p = header.findIndex((h, i) => i !== b && /product|name|presentation/.test(h));
    // A product named once for several batches (merged or blank cells) carries down to the rows below.
    let prev: string[] = [];
    for (const raw of rows.slice(1)) {
      const row = raw.length < header.length ? [...prev.slice(0, header.length - raw.length), ...raw] : [...raw];
      if (p >= 0 && !row[p] && prev[p]) row[p] = prev[p];
      prev = row;
      for (const part of (row[b] ?? '').split(/,|;|&|\band\b|\n/)) {
        const code = asBatchCode(part);
        if (code) out.push({ product: p >= 0 ? row[p] || null : null, batch: code, expiry: e >= 0 ? row[e] || null : null });
      }
    }
  }
  return out;
}

/** Batches written in the text: "Batch number: 5E10", "batch 23K019, expiry 11/2026", or a list after "the following batches". */
export function vmdTextBatches(html: string): VmdBatch[] {
  const out: VmdBatch[] = [];
  let listContext = false;
  for (const line of textLines(html)) {
    const label = line.match(/^(?:bulk\s+)?(?:batch|lot)(?:es)?\s*(?:numbers?|nos?\.?|codes?)?\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)$/i);
    if (label) {
      for (const part of label[1].split(/,|;|&|\band\b/)) {
        const code = asBatchCode(part.trim().split(/\s+/)[0]);
        if (code) out.push({ product: null, batch: code, expiry: expiryIn(part) ?? expiryIn(line) });
      }
      listContext = false;
      continue;
    }
    const lead = asBatchCode(line.split(/[\s,(]+/)[0]);
    if (listContext && lead) {
      out.push({ product: null, batch: lead, expiry: expiryIn(line) });
      continue;
    }
    for (const m of line.matchAll(/\b(?:batch|lot)(?:es)?\s+(?:(?:numbers?|no\.?|is|are|code)\s+)*:?\s*([A-Z0-9][A-Z0-9-]*)/gi)) {
      const code = asBatchCode(m[1]);
      if (code) out.push({ product: null, batch: code, expiry: expiryIn(line.slice(m.index ?? 0)) });
    }
    listContext = /\b(batch|batches|lot|lots)\b/i.test(line);
  }
  const seen = new Set<string>();
  return out.filter((b) => !seen.has(b.batch) && seen.add(b.batch));
}

/** Kept for older callers: batch codes and expiry, from a table or the text. */
export function vmdBatches(html: string): { batchCodes: string[]; expiry: string | null } {
  const found = vmdTableBatches(html);
  const all = found.length ? found : vmdTextBatches(html);
  const expiries = [...new Set(all.map((b) => b.expiry).filter((e): e is string => !!e))];
  return { batchCodes: [...new Set(all.map((b) => b.batch))], expiry: expiries.length ? expiries.slice(0, 3).join(', ') : null };
}

/** Why it's recalled: the "due to ..." part of the notice, e.g. "Visible particles present in the vials." */
const CAUSE = /\b(?:due to|because of|because|as a result of|owing to|as (?!a precaution)(?=(?:the|some|these|this|a)\b))\s*(?:the\s+(?=(?:possibility|potential|risk|presence|finding)))?(.+)$/i;
const FINDING = /\b(?:following|after|prompted by)\s+(?:the |a |an )?(?:observation|identification|detection|discovery|finding|report|complaint|confirmation)s?\s+(?:of|that)\s+(.+)$/i;
const PROBLEM = /\b(may not|may be|might|could|found|identified|observed|detected|risk|failed|out of specification|contaminat\w*|particles?|leak\w*|incorrect\w*|mislabel\w*)\b/i;
const NOT_A_REASON = /^we (?:wish|would like) to|\bhas initiated\b|\bhave initiated\b|\b(contact|e-?mail|telephone|tel\.?|phone|queries|enquiries)\b|\b(should|are asked|please)\b/i;

export function vmdReason(html: string): string | null {
  const sentences = sentencesOf(html);
  const ordered = [...sentences.filter((s) => /recall/i.test(s)), ...sentences.filter((s) => !/recall/i.test(s))];
  for (const s of ordered) {
    const m = s.match(CAUSE) ?? s.match(FINDING);
    if (m && m[1].length > 8) return asSentence(m[1]);
    const r = s.match(/^the reason for (?:the|this) recall (?:relates to|is) (?:the )?(?:identification|observation|detection|discovery|presence) of (.+)$/i);
    if (r && r[1].length > 8) return asSentence(r[1]);
  }
  // Otherwise the first sentence that describes a problem, e.g. "The affected batches may not ...".
  const problem = sentences.find((s) => PROBLEM.test(s) && !NOT_A_REASON.test(s));
  if (problem) {
    return asSentence(problem.replace(/^(?:it has been (?:identified|found|confirmed|observed|reported) that|this is because|the reason for (?:the|this) recall is(?: that)?)\s*/i, ''));
  }
  return null;
}

/** The notice's opening line without "We wish to inform ... that". */
function openingLine(html: string): string | null {
  const first = sentencesOf(html)[0];
  if (!first) return null;
  return asSentence(first.replace(/^we (?:wish|would like) to (?:inform|advise|notify|make)\b.*?\bthat\s+/i, ''));
}

/** What to do: sentences asking people to act, plus who the recall is aimed at. */
export function vmdAction(html: string): string | null {
  const asks = sentencesOf(html).filter((s) =>
    !/^we (?:wish|would like) to/i.test(s) &&
    /\b(should|are (?:being )?asked|asked to|please|return|quarantine|examine|check (?:their|your|stock|inventory))\b/i.test(s));
  const level = sentencesOf(html).join(' ').match(/recall (?:to|at) (?:the )?([a-z /]+?) level/i)?.[1];
  const parts = asks.slice(0, 2);
  if (level) parts.push(`This recall is at ${level.toLowerCase()} level.`);
  return parts.length ? parts.join(' ') : null;
}

/** Converts one GOV.UK VMD recall into our Recall format. */
export function normaliseVmdItem(content: Json): Recall {
  const body: string = content.details?.body ?? '';
  const title: string = cleanText(content.title) ?? '';
  const name = vmdProductName(title);
  const basePath: string = content.base_path ?? '';
  const slug = basePath.split('/').pop() ?? basePath;
  const sections = sectionsOf(body);
  const findSection = (...patterns: RegExp[]) => {
    for (const p of patterns) for (const [h, t] of sections) if (p.test(h)) return t;
    return null;
  };
  const fields = vmdFields(body);
  const publishedAt = toIso(content.first_published_at ?? content.public_updated_at);
  const description = cleanText(content.description);
  const descriptionUseful = description && !/^(?:product (?:defect )?|batch )?recall/i.test(description)
    && description.toLowerCase() !== title.toLowerCase();

  // What's wrong: the notice's own reason first, as the GOV.UK description often repeats the title.
  const summary = fieldLike(fields, /reason|nature of|defect|problem|issue/, /recall alert/)[0]
    ?? findSection(/reason|nature of|defect|problem|issue/)
    ?? vmdReason(body)
    ?? (descriptionUseful ? description : null)
    ?? openingLine(body)
    ?? description;
  const advice = findSection(/action|advice|what to do/)
    ?? fieldLike(fields, /action|advice|what to do/)[0]
    ?? vmdAction(body);

  const notes = [...fields].filter(([k]) => /packing run|product code|\bma\b|marketing authori[sz]ation/.test(k))
    .map(([k, v]) => `${(k.charAt(0).toUpperCase() + k.slice(1)).replace(/\bma\b/i, 'MA')}: ${v}`);
  const productField = fieldLike(fields, /^product(?: name)?$/)[0];
  const mainName = productField && productField.length <= 160 ? productField : name;

  // One product per name in the batch table, or one product for the whole notice.
  const tableBatches = vmdTableBatches(body);
  const textBatches = tableBatches.length ? [] : vmdTextBatches(body);
  // Last resort: a two-column "Batch number | A1, B2" row.
  const fieldExpiry = fieldLike(fields, /expiry|use by/)[0] ?? null;
  const fieldBatches: VmdBatch[] = tableBatches.length || textBatches.length ? [] : fieldLike(fields, /\b(batch|lot)\b/, /packing|run/)
    .flatMap((v) => v.split(/,|;|&|\band\b/))
    .map((part) => asBatchCode(part.trim().split(/\s+/)[0]))
    .filter((c): c is string => !!c)
    .map((batch) => ({ product: null, batch, expiry: fieldExpiry }));
  const batches = [...tableBatches, ...textBatches, ...fieldBatches]
    .map((b) => ({ ...b, expiry: b.expiry ?? fieldExpiry }));
  const groups = new Map<string, VmdBatch[]>();
  for (const b of batches) {
    const key = b.product ?? mainName;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  if (!groups.size) groups.set(mainName, []);
  const products = [...groups].map(([productName, list]) => {
    const expiries = [...new Set(list.map((b) => b.expiry).filter((e): e is string => !!e))];
    return {
      name: productName,
      barcode: null,
      packSize: null,
      batchCodes: [...new Set(list.map((b) => b.batch))],
      bestBefore: expiries.length ? `Expiry: ${expiries.length > 4 ? `${expiries.slice(0, 4).join(', ')} and others` : expiries.join(', ')}` : null,
      useBy: null,
      batchNotes: notes.length ? notes.join('\n') : null,
    };
  });
  const { documentUrl } = mediaOf(content.details?.attachments, body);

  return {
    id: `vmd:${slug.slice(-60)}`,
    source: 'vmd',
    sourceRef: slug,
    alertType: 'recall',
    title: name,
    summary: shorten(summary),
    advice: shorten(advice, 400),
    riskLevel: null,
    categories: ['pets'],
    allergens: [],
    businesses: [],
    sourceUrl: `${GOVUK}${basePath}`,
    documentUrl,
    imageUrl: null,
    publishedAt,
    updatedAt: toIso(content.public_updated_at, publishedAt),
    products,
  };
}

/** Lists the VMD's recall notices since `since`, then reads each one. */
export async function fetchVmdSince(fetchFn: FetchFn, since: string, maxItems = 50): Promise<Recall[]> {
  const fromDate = since.slice(0, 10);
  const url = `${GOVUK}/api/search.json?filter_organisations=${VMD_ORG}&filter_content_store_document_type=news_story` +
    `&filter_public_timestamp=from:${fromDate}&order=-public_timestamp&count=${maxItems}&fields=link,title,public_timestamp`;
  const page = await getJson(fetchFn, url);
  const links = asArray<Json>(page.results)
    .filter((r) => typeof r.link === 'string' && isVmdRecallTitle(String(r.title ?? '')))
    .filter((r) => new Date(r.public_timestamp) >= new Date(since))
    .map((r) => r.link as string);
  const contents = await mapLimit([...new Set(links)], 4, (link) => getJson(fetchFn, `${GOVUK}/api/content${link}`));
  return contents
    .filter((c) => !(c.withdrawn_notice && Object.keys(c.withdrawn_notice).length))
    .filter((c) => isVmdRecallTitle(String(c.title ?? '')))
    .map(normaliseVmdItem);
}
