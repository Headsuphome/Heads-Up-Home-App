import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { barcodeVariants, fromRow } from './logic';

const FIELDS = [
  'id', 'source', 'alert_type', 'title', 'summary', 'advice', 'risk_level',
  'categories', 'allergens', 'businesses', 'source_url', 'document_url', 'image_url', 'published_at',
  'recall_products(name,barcode,pack_size,batch_codes,best_before,use_by,batch_notes)',
].join(',');

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json' },
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
  const query = (fields) => `recalls?select=${encodeURIComponent(fields)}&order=published_at.desc&limit=${limit}`;
  try {
    return (await get(query(FIELDS))).map(fromRow);
  } catch (e) {
    return (await get(query(BASIC_FIELDS))).map(fromRow);
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

/**
 * A product's name and brand from Open Food Facts, looked up by its barcode, to fill in the
 * cupboard form after a scan. Covers food and drink; for anything else the person types the name.
 */
export async function productForBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8) return null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,quantity`,
      { headers: { 'User-Agent': 'HeadsUpHome/0.1 (support@headsuphome.co.uk)' } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const name = (p.product_name_en || p.product_name || '').trim();
    if (!name) return null;
    const brand = String(p.brands || '').split(',')[0].trim();
    const quantity = String(p.quantity || '').trim();
    return { name: quantity && !name.includes(quantity) ? `${name} ${quantity}` : name, brand: brand || null };
  } catch (e) {
    return null;
  }
}
