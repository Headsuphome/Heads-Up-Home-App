import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { barcodeVariants, fromRow } from './logic';

const FIELDS = [
  'id', 'source', 'alert_type', 'title', 'summary', 'advice', 'risk_level',
  'categories', 'allergens', 'businesses', 'source_url', 'document_url', 'image_url', 'published_at',
  'recall_products(name,barcode,pack_size,batch_codes,best_before,use_by,batch_notes)',
].join(',');

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    // x-heads-up-client tells the database this version labels EU warnings, so it may see them.
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json', 'x-heads-up-client': '2' },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* not JSON */ }
    throw new Error(`Couldn't load recalls (${res.status}${detail ? `: ${detail}` : ''})`);
  }
  return res.json();
}

// Same list without the photo columns, for a database that hasn't had the photos update yet.
const BASIC_FIELDS = FIELDS.replace(',document_url,image_url', '');

/** The most recent recalls, newest first. */
export async function fetchRecalls(limit = 200) {
  const query = (fields) => `recalls?select=${encodeURIComponent(fields)}&source=neq.eu&order=published_at.desc&limit=${limit}`;
  try {
    return (await get(query(FIELDS))).map(fromRow);
  } catch (e) {
    return (await get(query(BASIC_FIELDS))).map(fromRow);
  }
}

/** The latest EU Safety Gate warnings, kept separate so they never crowd out UK recalls. */
export async function fetchEuWarnings(limit = 100) {
  const query = (fields) => `recalls?select=${encodeURIComponent(fields)}&source=eq.eu&order=published_at.desc&limit=${limit}`;
  try {
    return (await get(query(FIELDS))).map(fromRow);
  } catch (e) {
    return [];
  }
}

/** One recall by its id, for example when someone taps an alert about it. */
export async function fetchRecall(id) {
  const query = (fields) => `recalls?select=${encodeURIComponent(fields)}&id=eq.${encodeURIComponent(id)}&limit=1`;
  let rows;
  try {
    rows = await get(query(FIELDS));
  } catch (e) {
    rows = await get(query(BASIC_FIELDS));
  }
  return rows.length ? fromRow(rows[0]) : null;
}

/**
 * A product photo from Open Food Facts, a free shared product database.
 * Only ever looked up by exact barcode, so it can't show the wrong product.
 */
export async function foodPhotoForBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8) return null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=image_front_url,image_url,product_name`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return json.product.image_front_url || json.product.image_url || null;
  } catch (e) {
    return null;
  }
}

/** Searches every recall we hold, not just the recent ones already loaded. */
export async function searchAllRecalls(query, limit = 50) {
  const term = String(query).trim().replace(/[*,()]/g, ' ');
  if (term.length < 3) return [];
  const pattern = encodeURIComponent(`*${term}*`);
  const rows = await get(`recalls?select=${encodeURIComponent(FIELDS)}&search_text=ilike.${pattern}&order=published_at.desc&limit=${limit}`);
  return rows.map(fromRow);
}

/** Every recall we hold that lists this barcode, newest first. */
export async function recallsForBarcode(code) {
  const variants = barcodeVariants(code);
  if (!variants.length) return [];
  const rows = await get(`recall_products?select=recall_id&barcode=in.(${variants.join(',')})&limit=50`);
  const ids = [...new Set(rows.map((r) => r.recall_id))];
  if (!ids.length) return [];
  const idList = encodeURIComponent(ids.map((id) => `"${id}"`).join(','));
  const query = (fields) => `recalls?select=${encodeURIComponent(fields)}&id=in.(${idList})&order=published_at.desc`;
  try {
    return (await get(query(FIELDS))).map(fromRow);
  } catch (e) {
    return (await get(query(BASIC_FIELDS))).map(fromRow);
  }
}

// Free, shared product databases from the Open Food Facts project, each with the same API.
// Food first, then cosmetics and toiletries, pet food, and everything else.
const PRODUCT_DATABASES = [
  { host: 'world.openfoodfacts.org', source: 'Open Food Facts' },
  { host: 'world.openbeautyfacts.org', source: 'Open Beauty Facts' },
  { host: 'world.openpetfoodfacts.org', source: 'Open Pet Food Facts' },
  { host: 'world.openproductsfacts.org', source: 'Open Products Facts' },
];
const PRODUCT_FIELDS = 'product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,image_front_url';

async function productFrom(db, code) {
  try {
    const res = await fetch(`https://${db.host}/api/v2/product/${code}.json?fields=${PRODUCT_FIELDS}`, {
      headers: { 'User-Agent': 'HeadsUpHome/1.0 (support@headsuphome.co.uk)' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const name = String(p.product_name_en || p.product_name || p.generic_name || '').trim();
    if (!name) return null;
    return {
      name,
      brand: String(p.brands || '').split(',')[0].trim() || null,
      size: String(p.quantity || '').trim() || null,
      photo: p.image_front_small_url || p.image_front_url || null,
      source: db.source,
    };
  } catch (e) {
    return null;
  }
}

/** A name Heads Up Home users have given this barcode, from our own shared product list. */
async function sharedProduct(code) {
  try {
    const rows = await get(`shared_products?select=name,brand&barcode=eq.${encodeURIComponent(code.replace(/^0+/, ''))}&limit=1`);
    if (!rows.length) return null;
    return { name: rows[0].name, brand: rows[0].brand || null, size: null, photo: null, source: 'Heads Up Home users' };
  } catch (e) {
    return null; // the list isn't set up yet, or we're offline
  }
}

/**
 * What a barcode is: name, brand, size, photo and where we found it. Asks every database at
 * once and keeps the best answer: the official product databases first, then our own list.
 * Null when nobody knows the product yet.
 */
export async function productForBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8) return null;
  const answers = await Promise.all([...PRODUCT_DATABASES.map((db) => productFrom(db, code)), sharedProduct(code)]);
  return answers.find(Boolean) || null;
}

/**
 * Adds a name someone typed for an unknown barcode to Heads Up Home's shared product list,
 * so the next person who scans it sees what it is. Nothing about the person is sent.
 */
export async function suggestProductName(barcode, name, brand) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/suggest_product`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_barcode: String(barcode || ''), p_name: name, p_brand: brand || null }),
    });
  } catch (e) {
    // Best effort: the item is still saved in their cupboard.
  }
}
