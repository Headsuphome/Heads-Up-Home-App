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
  { key: 'pets', label: 'Pets & animals', icon: 'paw-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

/**
 * The 14 allergens UK food law requires to be declared. Keys match the backend.
 * `label` is what people pick from; `short` is used on badges. Most common first.
 */
export const ALLERGENS = [
  { key: 'milk', label: 'Dairy (milk)', short: 'Dairy' },
  { key: 'eggs', label: 'Eggs', short: 'Eggs' },
  { key: 'peanuts', label: 'Peanuts', short: 'Peanuts' },
  { key: 'tree-nuts', label: 'Tree nuts (almonds, cashews, walnuts…)', short: 'Tree nuts' },
  { key: 'gluten', label: 'Gluten (wheat, barley, rye, oats)', short: 'Gluten' },
  { key: 'soya', label: 'Soya', short: 'Soya' },
  { key: 'sesame', label: 'Sesame', short: 'Sesame' },
  { key: 'fish', label: 'Fish', short: 'Fish' },
  { key: 'crustaceans', label: 'Crustaceans (prawns, crab, lobster)', short: 'Crustaceans' },
  { key: 'molluscs', label: 'Molluscs (mussels, oysters, squid)', short: 'Molluscs' },
  { key: 'celery', label: 'Celery', short: 'Celery' },
  { key: 'mustard', label: 'Mustard', short: 'Mustard' },
  { key: 'lupin', label: 'Lupin (a flour made from beans)', short: 'Lupin' },
  { key: 'sulphites', label: 'Sulphites (in wine, dried fruit)', short: 'Sulphites' },
];

export const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key);

/** True when every one of the 14 is chosen. */
export function hasAllAllergens(chosen) {
  return ALLERGEN_KEYS.every((k) => (chosen || []).includes(k));
}

/** Picks all 14 (keeping any "other" allergens), or clears them if all 14 are already picked. */
export function toggleAllAllergens(chosen) {
  const others = (chosen || []).filter((a) => isOtherAllergen(a));
  return hasAllAllergens(chosen) ? others : [...ALLERGEN_KEYS, ...others];
}

// Allergens people type themselves ("kiwi", "pea protein") are stored as "other:kiwi",
// beside the 14 keys, so they sync to the account with no extra setup.
const OTHER = 'other:';
export const MAX_OTHER_ALLERGENS = 10;

export function isOtherAllergen(key) {
  return typeof key === 'string' && key.startsWith(OTHER);
}

/** "  Pea   Protein " -> "other:pea protein", or null if it isn't a usable word. */
export function otherAllergenKey(text) {
  const word = String(text || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (word.length < 2 || word.length > 30) return null;
  return OTHER + word;
}

export function otherAllergenWord(key) {
  return isOtherAllergen(key) ? key.slice(OTHER.length) : null;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a food recall mentions an allergen someone typed themselves.
 * Only food and allergy recalls count, and only whole words ("kiwi" or "kiwis", not "kiwifruit-flavour").
 */
export function mentionsOtherAllergen(recall, key) {
  const word = otherAllergenWord(key);
  if (!word) return false;
  const food = recall.alertType === 'allergy' || (recall.categories || []).includes('food-drink');
  if (!food) return false;
  const text = [recall.title, recall.summary, ...(recall.products || []).map((p) => p.name)].join(' ').toLowerCase();
  return new RegExp(`(^|[^a-z])${escapeRegExp(word)}(s|es)?([^a-z]|$)`).test(text);
}

const categoryLabels = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const allergenLabels = Object.fromEntries(ALLERGENS.map((a) => [a.key, a.short]));

export const categoryLabel = (key) => categoryLabels[key] || 'Other';

const categoryIcons = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

/** A recall's most specific category, which picks its icon and colour. */
export function primaryCategory(recall) {
  const cats = recall.categories || [];
  return cats.find((c) => c !== 'other' && c !== 'baby-children') || cats[0] || 'other';
}

/** The icon shown when a recall has no photo. */
export function iconFor(recall) {
  return categoryIcons[primaryCategory(recall)] || categoryIcons.other;
}

/** How many recalls were published in the last `days` days. */
/** EU Safety Gate warnings are shown, but kept out of the UK recall counts. */
export function isUkRecall(recall) {
  return recall.source !== 'eu';
}

/** UK recalls published in the last `days` days. */
export function recentRecalls(recalls, days, now = new Date()) {
  const since = now.getTime() - days * 86400000;
  return recalls.filter((r) => isUkRecall(r) && new Date(r.publishedAt).getTime() >= since);
}

export function recentCount(recalls, days = 7, now = new Date()) {
  return recentRecalls(recalls, days, now).length;
}

/** The first barcode on a recall, if the agency published one. */
export function firstBarcode(recall) {
  const p = (recall.products || []).find((x) => x.barcode);
  return p ? p.barcode : null;
}
export const allergenLabel = (key) => {
  if (allergenLabels[key]) return allergenLabels[key];
  const word = otherAllergenWord(key);
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : key;
};

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
  vmd: { name: 'Veterinary Medicines Directorate', short: 'VMD' },
  hse: { name: 'Health and Safety Executive', short: 'HSE' },
  eu: { name: 'EU Safety Gate (European Commission)', short: 'EU Safety Gate' },
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
  if (recall.source === 'eu') return { text: 'EU warning', tone: 'warning' };
  if (recall.source === 'hse') return { text: 'Work safety alert', tone: recall.riskLevel === 'serious' ? 'danger' : 'warning' };
  if (recall.source === 'mhra') {
    if (recall.alertType === 'field-safety-notice') return { text: 'Medical device notice', tone: 'warning' };
    if (recall.alertType === 'safety-alert') return { text: 'Health device alert', tone: 'warning' };
    switch (recall.riskLevel) {
      case 'serious': return { text: 'Urgent medicine recall', tone: 'danger' };
      case 'high': return { text: 'Medicine recall', tone: 'danger' };
      case 'medium': return { text: 'Medicine recall', tone: 'warning' };
      default: return { text: 'Medicine notice', tone: 'neutral' };
    }
  }
  if (recall.source === 'vmd') return { text: 'Pet medicine recall', tone: 'warning' };
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

/** Just the digits of a barcode, without leading zeros, so EAN-13 and UPC-A forms of a code match. */
export function cleanBarcode(code) {
  return String(code || '').replace(/\D/g, '').replace(/^0+/, '');
}

function barcodesMatch(a, b) {
  if (!a || !b) return false;
  return cleanBarcode(a).length >= 8 && cleanBarcode(a) === cleanBarcode(b);
}

/** Whether a product barcode's last digit checks out (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function gtinValid(code) {
  const digits = String(code || '');
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  let sum = 0;
  for (let i = 1; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** A short 8-digit UPC-E code written out as the 12-digit UPC-A it stands for, or null. */
export function expandUpcE(code) {
  const d = String(code || '');
  if (!/^[01]\d{7}$/.test(d)) return null;
  const [ns, a, b, c, e, f, g, check] = d;
  let body;
  if ('012'.includes(g)) body = `${a}${b}${g}0000${c}${e}${f}`;
  else if (g === '3') body = `${a}${b}${c}00000${e}${f}`;
  else if (g === '4') body = `${a}${b}${c}${e}00000${f}`;
  else body = `${a}${b}${c}${e}${f}0000${g}`;
  return `${ns}${body}${check}`;
}

/**
 * The digits of a scanned product barcode, or null if it doesn't check out as one.
 * A misread label or half a barcode almost never passes the check digit, so it's ignored.
 */
export function productCodeFrom(data, kind) {
  const digits = String(data || '').replace(/\D/g, '');
  if (gtinValid(digits)) return digits;
  if (digits.length === 8 && (String(kind || '').toLowerCase().includes('upc') || !gtinValid(digits))) {
    const upcA = expandUpcE(digits);
    if (upcA && gtinValid(upcA)) return digits;
  }
  return null;
}

/**
 * Waits until the camera has read the same code several times over most of a second before
 * accepting it, so a glimpse of a different barcode or a misread doesn't count. Returns a function
 * that takes each reading and says 'confirmed', 'reading' (keep holding) or 'ignored'.
 */
export function scanConfirmer({ reads = 3, ms = 900, forgetAfter = 2500 } = {}) {
  const seen = new Map();
  return (data, kind, now = Date.now()) => {
    const code = productCodeFrom(data, kind);
    if (!code) return { state: 'ignored', code: null };
    for (const [c, s] of seen) if (now - s.last > forgetAfter) seen.delete(c);
    const s = seen.get(code) || { first: now, last: now, reads: 0 };
    s.reads += 1;
    s.last = now;
    seen.set(code, s);
    return { state: s.reads >= reads && now - s.first >= ms ? 'confirmed' : 'reading', code };
  };
}

/** The ways the same barcode might be written in a recall notice (with or without leading zeros). */
export function barcodeVariants(code) {
  const core = cleanBarcode(code);
  if (core.length < 7 || core.length > 14) return [];
  const out = new Set([core]);
  for (const len of [8, 12, 13, 14]) if (len > core.length) out.add(core.padStart(len, '0'));
  return [...out];
}

/** Recalls (from the ones already loaded) that list this barcode. */
export function recallsWithBarcode(recalls, code) {
  const core = cleanBarcode(code);
  if (core.length < 7) return [];
  return recalls.filter((r) => r.products.some((p) => p.barcode && cleanBarcode(p.barcode) === core));
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
  if (isUkRecall(recall) && prefs.allergens.some((a) => isOtherAllergen(a) && mentionsOtherAllergen(recall, a))) return 'allergen';
  if (recall.categories.some((c) => prefs.categories.includes(c))) return 'category';
  return null;
}

/**
 * Filters recalls for a feed. `filter` is 'for-you', 'all', 'eu' or a category key.
 * EU warnings appear only under 'eu', or in 'for-you' when they match the person's cupboard.
 */
export function filterRecalls(recalls, filter, prefs, matchedIds) {
  if (filter === 'eu') return recalls.filter((r) => !isUkRecall(r));
  if (filter === 'all') return recalls.filter(isUkRecall);
  if (filter === 'for-you') {
    const hasPrefs = prefs.categories.length || prefs.allergens.length || (matchedIds && matchedIds.size);
    const matched = (r) => matchedIds && matchedIds.has(r.id);
    if (!hasPrefs) return recalls.filter(isUkRecall);
    return recalls.filter((r) => (isUkRecall(r) ? relevance(r, prefs, matchedIds) : matched(r)));
  }
  return recalls.filter((r) => isUkRecall(r) && r.categories.includes(filter));
}

export function searchRecalls(recalls, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return recalls;
  return recalls.filter((r) => {
    const hay = [r.title, r.summary, ...r.businesses, ...r.products.map((p) => p.name)].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** What Heads Up Home has done for this person since they started using it. */
export function impactStats(recalls, prefs, matchedIds, now = new Date()) {
  const since = prefs.joinedAt ? new Date(prefs.joinedAt) : null;
  const fromStart = since ? recalls.filter((r) => isUkRecall(r) && new Date(r.publishedAt) >= since) : [];
  return {
    since: prefs.joinedAt || null,
    days: since ? Math.max(1, Math.ceil((now - since) / 86400000)) : 0,
    checked: fromStart.length,
    relevant: fromStart.filter((r) => relevance(r, prefs, matchedIds)).length,
    cupboard: (prefs.cupboard || []).length,
    allergens: (prefs.allergens || []).length,
    categories: (prefs.categories || []).length,
  };
}
