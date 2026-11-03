// Decides who should hear about a recall, and how sure we are.
//
// Priority (one alert per person per recall):
//   1. cupboard  – something they told us they own looks like the recalled product
//   2. allergen  – an allergy alert for an allergen in their household
//   3. category  – a recall in a category they follow
//
// Cupboard confidence:
//   barcode  – exact barcode match (only when the agency publishes barcodes)
//   likely   – brand matches and most of the product name matches
//   possible – partial match; the app asks the person to check the batch code
// We never claim certainty from a name match: the person always confirms.

import type { CupboardItem, Match, MatchConfidence, Recall, UserProfile } from './types.ts';

const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'of', 'in', 'a', 'an', 'to', 'by', 'on',
  'pack', 'packs', 'multipack', 'x', 'g', 'kg', 'ml', 'l', 'ltr', 'litre', 'litres',
  'recalls', 'recall', 'because', 'may', 'contain', 'contains', 'undeclared', 'product', 'products',
  'sold', 'via', 'amazon', 'ebay', 'temu', 'shein', 'online', 'presenting', 'serious', 'risk',
]);

/** Meaningful lower-case words, lightly de-pluralised. "Baby Rice Cereals 200g" -> baby, rice, cereal, 200g */
export function tokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d)\s+(g|kg|ml|l|ltr)\b/g, '$1$2') // "200 g" -> "200g"
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d{1,2}$/.test(w) && (w.length >= 3 || /\d/.test(w)))
    .map((w) => (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w));
}

export function barcodesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  // Treat EAN-13 and UPC-A (12 digits) as the same code when they differ only by a leading zero.
  const clean = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  return clean(a).length >= 8 && clean(a) === clean(b);
}

/** How well one cupboard item matches one recall. */
export function cupboardConfidence(item: CupboardItem, recall: Recall): MatchConfidence {
  if (item.dismissedRecalls.includes(recall.id)) return null;

  if (item.barcode && recall.products.some((p) => barcodesMatch(item.barcode, p.barcode))) {
    return 'barcode';
  }

  const recallWords = new Set(tokens([
    recall.title,
    ...recall.products.map((p) => p.name),
    ...recall.businesses,
  ].join(' ')));

  const nameWords = tokens(item.name);
  if (nameWords.length === 0) return null;
  const overlap = nameWords.filter((w) => recallWords.has(w)).length / nameWords.length;

  const brandWords = tokens(item.brand);
  const brandKnown = brandWords.length > 0;
  const brandMatches = brandKnown && brandWords.every((w) => recallWords.has(w));

  if (brandKnown && !brandMatches) return null; // different brand: not this recall
  if (brandMatches && overlap >= 0.75) return 'likely';
  if (brandMatches && overlap >= 0.5) return 'possible';
  if (!brandKnown && nameWords.length >= 2 && overlap >= 0.75) return 'possible';
  return null;
}

const RANK: Record<string, number> = { barcode: 3, likely: 2, possible: 1 };

/**
 * Works out every alert a recall should create.
 * `profiles` and `cupboard` may be pre-filtered by the database; this function
 * makes the final decision either way.
 */
export function matchRecall(recall: Recall, profiles: UserProfile[], cupboard: CupboardItem[]): Match[] {
  const byUser = new Map<string, Match>();

  // 1. Cupboard matches — keep the most confident item per person.
  for (const item of cupboard) {
    const confidence = cupboardConfidence(item, recall);
    if (!confidence) continue;
    const existing = byUser.get(item.userId);
    if (!existing || RANK[confidence] > RANK[existing.confidence ?? '']) {
      byUser.set(item.userId, { userId: item.userId, recallId: recall.id, reason: 'cupboard', confidence, cupboardItemId: item.id });
    }
  }

  // EU warnings aren't UK recalls, so they only alert people whose cupboard matches.
  for (const profile of recall.source === 'eu' ? [] : profiles) {
    if (byUser.has(profile.userId)) continue;

    // 2. Allergens in their household.
    if (recall.allergens.some((a) => profile.allergens.includes(a))) {
      byUser.set(profile.userId, { userId: profile.userId, recallId: recall.id, reason: 'allergen', confidence: null, cupboardItemId: null });
      continue;
    }

    // 3. Categories they follow.
    if (recall.categories.some((c) => profile.categories.includes(c))) {
      byUser.set(profile.userId, { userId: profile.userId, recallId: recall.id, reason: 'category', confidence: null, cupboardItemId: null });
    }
  }

  return [...byUser.values()];
}

/** The words on someone's lock screen. Short, calm and specific. */
export function notificationText(recall: Recall, match: Match, itemName?: string): { title: string; body: string } {
  if (match.reason === 'cupboard') {
    const what = itemName ?? recall.title;
    if (recall.source === 'eu') {
      return match.confidence === 'barcode'
        ? { title: 'Safety warning: an item in your cupboard', body: `${what} was reported as dangerous in the EU. Tap to see what to do.` }
        : { title: 'Possible safety warning in your cupboard', body: `${what} may match a product reported as dangerous in the EU. Tap to check.` };
    }
    return match.confidence === 'barcode'
      ? { title: 'Recall: an item in your cupboard', body: `${what} has been recalled. Tap to see what to do.` }
      : { title: 'Possible recall in your cupboard', body: `${what} may be affected. Tap to check your batch code.` };
  }
  if (match.reason === 'allergen') {
    return { title: 'Allergy alert', body: recall.title };
  }
  if (recall.alertType === 'field-safety-notice') return { title: 'Medical device notice', body: recall.title };
  if (recall.source === 'hse') return { title: 'Work safety alert', body: recall.title };
  return { title: recall.riskLevel === 'serious' ? 'Serious-risk recall' : 'New recall', body: recall.title };
}
