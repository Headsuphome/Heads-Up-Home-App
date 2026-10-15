// Pure helpers: no React, no network. Shared by every screen and covered by tests.

export const CATEGORIES = [
  { key: 'food-drink', label: 'Food & drink', icon: 'restaurant-outline' },
  { key: 'baby-children', label: 'Baby & children', icon: 'happy-outline' },
  { key: 'toys', label: 'Toys', icon: 'cube-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'trades-tools', label: 'Trades & tools', icon: 'construct-outline' },
  { key: 'home-furniture', label: 'Home & furniture', icon: 'bed-outline' },
  { key: 'cosmetics', label: 'Cosmetics', icon: 'color-palette-outline' },
  { key: 'clothing', label: 'Clothing & accessories', icon: 'shirt-outline' },
  { key: 'medicines', label: 'Medicines & health', icon: 'medkit-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

/** The 14 allergens UK food law requires to be declared. Keys match the backend. */
export const ALLERGENS = [
  { key: 'celery', label: 'Celery' },
  { key: 'gluten', label: 'Gluten' },
  { key: 'crustaceans', label: 'Crustaceans' },
  { key: 'eggs', label: 'Eggs' },
  { key: 'fish', label: 'Fish' },
  { key: 'lupin', label: 'Lupin' },
  { key: 'milk', label: 'Milk' },
  { key: 'molluscs', label: 'Molluscs' },
  { key: 'mustard', label: 'Mustard' },
  { key: 'tree-nuts', label: 'Tree nuts' },
  { key: 'peanuts', label: 'Peanuts' },
  { key: 'sesame', label: 'Sesame' },
  { key: 'soya', label: 'Soya' },
  { key: 'sulphites', label: 'Sulphites' },
];

const categoryLabels = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const allergenLabels = Object.fromEntries(ALLERGENS.map((a) => [a.key, a.label]));

export const categoryLabel = (key) => categoryLabels[key] || 'Other';

const categoryIcons = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

/** The icon shown when a recall has no photo: its most specific category. */
export function iconFor(recall) {
  const cats = recall.categories || [];
  const key = cats.find((c) => c !== 'other' && c !== 'baby-children') || cats[0] || 'other';
  return categoryIcons[key] || categoryIcons.other;
}

/** The first barcode on a recall, if the agency published one. */
export function firstBarcode(recall) {
  const p = (recall.products || []).find((x) => x.barcode);
  return p ? p.barcode : null;
}
export const allergenLabel = (key) => allergenLabels[key] || key;

/** Turns a database row into the shape the screens use. */
export function fromRow(row) {
  return {
    id: row.id,
    source: row.source,
    alertType: row.alert_type,
    title: row.title,
    summary: row.summary,
    advice: row.advice,
    riskLevel: row.risk_level,
    categories: row.categories || [],
    allergens: row.allergens || [],
    businesses: row.businesses || [],
    sourceUrl: row.source_url,
    documentUrl: row.document_url || null,
    imageUrl: row.image_url || null,
    publishedAt: row.published_at,
    products: (row.recall_products || []).map((p) => ({
      name: p.name,
      barcode: p.barcode,
      packSize: p.pack_size,
      batchCodes: p.batch_codes || [],
      bestBefore: p.best_before,
      useBy: p.use_by,
      batchNotes: p.batch_notes,
    })),
  };
}

const SOURCES = {
  fsa: { name: 'Food Standards Agency', short: 'FSA' },
  fss: { name: 'Food Standards Scotland', short: 'FSS' },
  opss: { name: 'Office for Product Safety and Standards', short: 'OPSS' },
  mhra: { name: 'Medicines and Healthcare products Regulatory Agency', short: 'MHRA' },
};
export const sourceName = (source) => (SOURCES[source] || SOURCES.opss).name;
export const sourceShort = (source) => (SOURCES[source] || SOURCES.opss).short;
const isFood = (recall) => recall.source === 'fsa' || recall.source === 'fss';

/**
 * The coloured label on each recall. `tone` picks the colour:
 * danger (red), warning (orange), info (blue), neutral (grey).
 */
export function badgeFor(recall) {
  if (recall.alertType === 'allergy') {
    const names = recall.allergens.map(allergenLabel);
    return { text: names.length ? `Allergy · ${names.slice(0, 2).join(', ')}` : 'Allergy alert', tone: 'warning' };
  }
  if (recall.source === 'mhra') {
    if (recall.alertType === 'safety-alert') return { text: 'Health device alert', tone: 'warning' };
    switch (recall.riskLevel) {
      case 'serious': return { text: 'Urgent medicine recall', tone: 'danger' };
      case 'high': return { text: 'Medicine recall', tone: 'danger' };
      case 'medium': return { text: 'Medicine recall', tone: 'warning' };
      default: return { text: 'Medicine notice', tone: 'neutral' };
    }
  }
  switch (recall.riskLevel) {
    case 'serious': return { text: 'Serious risk', tone: 'danger' };
    case 'high': return { text: 'High risk', tone: 'danger' };
    case 'medium': return { text: 'Medium risk', tone: 'warning' };
    case 'low': return { text: 'Low risk', tone: 'neutral' };
    default: break;
  }
  if (isFood(recall)) return { text: 'Food recall', tone: 'info' };
  if (recall.alertType === 'safety-alert') return { text: 'Safety alert', tone: 'warning' };
  return { text: 'Product recall', tone: 'info' };
}

/** "Today", "Yesterday", "3 days ago", or "12 Oct". */
export function friendlyDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.getDate()} ${months[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

// ───────── Cupboard matching (same rules as the backend's matching.ts) ─────────

const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'of', 'in', 'a', 'an', 'to', 'by', 'on',
  'pack', 'packs', 'multipack', 'x', 'g', 'kg', 'ml', 'l', 'ltr', 'litre', 'litres',
  'recalls', 'recall', 'because', 'may', 'contain', 'contains', 'undeclared', 'product', 'products',
  'sold', 'via', 'amazon', 'ebay', 'temu', 'shein', 'online', 'presenting', 'serious', 'risk',
]);

export function tokens(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d)\s+(g|kg|ml|l|ltr)\b/g, '$1$2')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d{1,2}$/.test(w) && (w.length >= 3 || /\d/.test(w)))
    .map((w) => (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w));
}

function barcodesMatch(a, b) {
  if (!a || !b) return false;
  const clean = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '');
  return clean(a).length >= 8 && clean(a) === clean(b);
}

/** 'barcode' | 'likely' | 'possible' | null */
export function cupboardConfidence(item, recall) {
  if ((item.dismissed || []).includes(recall.id)) return null;
  if (item.barcode && recall.products.some((p) => barcodesMatch(item.barcode, p.barcode))) return 'barcode';

  const recallWords = new Set(tokens([recall.title, ...recall.products.map((p) => p.name), ...recall.businesses].join(' ')));
  const nameWords = tokens(item.name);
  if (nameWords.length === 0) return null;
  const overlap = nameWords.filter((w) => recallWords.has(w)).length / nameWords.length;

  const brandWords = tokens(item.brand);
  const brandKnown = brandWords.length > 0;
  const brandMatches = brandKnown && brandWords.every((w) => recallWords.has(w));

  if (brandKnown && !brandMatches) return null;
  if (brandMatches && overlap >= 0.75) return 'likely';
  if (brandMatches && overlap >= 0.5) return 'possible';
  if (!brandKnown && nameWords.length >= 2 && overlap >= 0.75) return 'possible';
  return null;
}

const RANK = { barcode: 3, likely: 2, possible: 1 };

/** Every recall that looks like something in the cupboard, best match first. */
export function cupboardMatches(cupboard, recalls) {
  const found = [];
  for (const item of cupboard) {
    for (const recall of recalls) {
      const confidence = cupboardConfidence(item, recall);
      if (confidence) found.push({ item, recall, confidence });
    }
  }
  return found.sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || (a.recall.publishedAt < b.recall.publishedAt ? 1 : -1));
}

/** Why a recall is relevant to this person, or null. */
export function relevance(recall, prefs, matchedIds) {
  if (matchedIds && matchedIds.has(recall.id)) return 'cupboard';
  if (recall.allergens.some((a) => prefs.allergens.includes(a))) return 'allergen';
  if (recall.categories.some((c) => prefs.categories.includes(c))) return 'category';
  return null;
}

/** Filters recalls for a feed. `filter` is 'for-you', 'all' or a category key. */
export function filterRecalls(recalls, filter, prefs, matchedIds) {
  if (filter === 'all') return recalls;
  if (filter === 'for-you') {
    const hasPrefs = prefs.categories.length || prefs.allergens.length || (matchedIds && matchedIds.size);
    return hasPrefs ? recalls.filter((r) => relevance(r, prefs, matchedIds)) : recalls;
  }
  return recalls.filter((r) => r.categories.includes(filter));
}

export function searchRecalls(recalls, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return recalls;
  return recalls.filter((r) => {
    const hay = [r.title, r.summary, ...r.businesses, ...r.products.map((p) => p.name)].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
