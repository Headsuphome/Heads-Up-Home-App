// Food Standards Agency food alerts.
// API docs: https://data.food.gov.uk/food-alerts/ui/reference
// Licence: Open Government Licence v3.0 — attribution required (shown in the app on each recall).

import type { AlertType, Recall, RecallProduct } from './types.ts';
import { categoriesForFsa, normaliseAllergen } from './categories.ts';
import { asArray, cleanText, firstText, getJson, mapLimit, shorten, toIso, type FetchFn, type Json } from './util.ts';

export const FSA_BASE = 'https://data.food.gov.uk/food-alerts/id';

function fsaAlertTypeOf(item: Json): AlertType {
  const types = asArray<string>(item.type).join(' ');
  if (/\/AA\b|\bAA$/.test(types)) return 'allergy';
  if (/\/FAFA\b|\bFAFA$/.test(types)) return 'action';
  return 'recall';
}

function productFrom(p: Json): RecallProduct {
  const batches = asArray<Json>(p.batchDescription);
  const batchCodes = new Set<string>();
  let bestBefore: string | null = null;
  let useBy: string | null = null;
  const notes: string[] = [];
  for (const b of batches) {
    for (const code of [...asArray<string>(b.batchCode), ...asArray<string>(b.lotNumber)]) {
      if (typeof code === 'string' && code.trim()) batchCodes.add(code.trim());
    }
    bestBefore ??= firstText(b.bestBeforeDescription, b.bestBeforeDate);
    useBy ??= firstText(b.useByDescription, b.useByDate);
    const note = firstText(b.batchTextDescription);
    if (note) notes.push(note);
  }
  const barcode = firstText(p.productCode);
  return {
    name: firstText(p.productName) ?? 'Unnamed product',
    barcode: barcode && /^\d{8,14}$/.test(barcode.replace(/\s/g, '')) ? barcode.replace(/\s/g, '') : null,
    packSize: firstText(p.packSizeDescription),
    batchCodes: [...batchCodes],
    bestBefore,
    useBy,
    batchNotes: notes.length ? notes.join('; ') : null,
  };
}

/** The FSA links a customer notice (usually a PDF with a product photo) as "relatedMedia". */
export function fsaMedia(relatedMedia: unknown): { documentUrl: string | null; imageUrl: string | null } {
  let documentUrl: string | null = null;
  let imageUrl: string | null = null;
  for (const m of asArray<Json>(relatedMedia as Json)) {
    const url = typeof m === 'string' ? m : firstText(m?.['@id'], m?.url);
    if (!url || !/^https?:\/\//.test(url)) continue;
    if (!imageUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(url)) imageUrl = url;
    if (!documentUrl && /\.pdf(\?|$)/i.test(url)) documentUrl = url;
  }
  return { documentUrl, imageUrl };
}

/** Converts one FSA alert (full view) into our Recall format. */
export function normaliseFsaAlert(item: Json): Recall {
  const notation: string = item.notation ?? String(item['@id'] ?? '').split('/').pop();
  const problems = asArray<Json>(item.problem);
  const products = asArray<Json>(item.productDetails).map(productFrom);

  const allergenLabels = [
    ...problems.flatMap((p) => asArray<Json>(p.allergen)),
    ...asArray<Json>(item.productDetails).flatMap((p) => asArray<Json>(p.allergen)),
  ].map((a) => (typeof a === 'string' ? a : a?.label ?? a?.notation ?? ''));
  const allergens = [...new Set(allergenLabels.map(normaliseAllergen).filter((a): a is NonNullable<typeof a> => !!a))];

  const title = cleanText(firstText(item.title, item.shortTitle)) ?? notation;
  const summary = shorten(cleanText(firstText(...problems.map((p) => p.riskStatement), item.description)));
  const advice = shorten(cleanText(firstText(item.consumerAdvice)));
  const businesses = [item.reportingBusiness, ...asArray<Json>(item.otherBusiness)]
    .map((b) => firstText(b?.commonName))
    .filter((b): b is string => !!b);

  const alertType = fsaAlertTypeOf(item);
  const textForCategories = [title, ...products.map((p) => p.name)].join(' ');
  const publishedAt = toIso(item.created);

  return {
    id: `fsa:${notation}`,
    source: 'fsa',
    sourceRef: notation,
    alertType,
    title,
    summary,
    advice,
    riskLevel: null, // FSA doesn't grade risk; the app shows the alert type instead
    categories: categoriesForFsa(textForCategories),
    allergens,
    businesses,
    sourceUrl: firstText(item.alertURL) ?? `https://www.food.gov.uk/news-alerts/alert/${notation.toLowerCase()}`,
    ...fsaMedia(item.relatedMedia),
    publishedAt,
    updatedAt: toIso(item.modified, publishedAt),
    products,
  };
}

/**
 * Fetches every FSA alert published or changed since `since` (ISO date),
 * then each alert's full record so we get batch codes and barcodes.
 */
export async function fetchFsaSince(fetchFn: FetchFn, since: string, maxAlerts = 200): Promise<Recall[]> {
  const sinceParam = encodeURIComponent(since);
  const list = await getJson(fetchFn, `${FSA_BASE}?since=${sinceParam}&_limit=${maxAlerts}&_sort=-modified`);
  return fsaRecallsFor(fetchFn, asArray<Json>(list.items));
}

/** Reads the full record of each alert in a list (batches, advice) and converts the published ones. */
export async function fsaRecallsFor(fetchFn: FetchFn, items: Json[]): Promise<Recall[]> {
  const list = { items };
  const ids: string[] = asArray<Json>(list.items)
    .map((i) => i.notation ?? String(i['@id'] ?? '').split('/').pop())
    .filter(Boolean);

  const listItems = new Map<string, Json>(asArray<Json>(list.items).map((i) => [i.notation ?? String(i['@id'] ?? '').split('/').pop(), i]));

  // The single-alert endpoint returns the full record (batches, advice) by default.
  // If one alert can't be fetched, fall back to its summary rather than losing every food recall.
  const details = await mapLimit(ids, 5, async (id) => {
    try {
      return await getJson(fetchFn, `${FSA_BASE}/${encodeURIComponent(id)}`);
    } catch {
      return { items: [listItems.get(id)] };
    }
  });
  const recalls: Recall[] = [];
  for (const detail of details) {
    const item = Array.isArray(detail.items) ? detail.items[0] : detail.items ?? detail;
    if (!item) continue;
    const statusLabel = String(item.status?.label ?? 'Published');
    if (!/published/i.test(statusLabel)) continue; // skip withdrawn/draft notices
    recalls.push(normaliseFsaAlert(item));
  }
  return recalls;
}
