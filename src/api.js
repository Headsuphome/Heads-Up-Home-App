import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { fromRow } from './logic';

const FIELDS = [
  'id', 'source', 'alert_type', 'title', 'summary', 'advice', 'risk_level',
  'categories', 'allergens', 'businesses', 'source_url', 'published_at',
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

/** The most recent recalls, newest first. */
export async function fetchRecalls(limit = 200) {
  const rows = await get(`recalls?select=${encodeURIComponent(FIELDS)}&order=published_at.desc&limit=${limit}`);
  return rows.map(fromRow);
}

/** Searches every recall we hold, not just the recent ones already loaded. */
export async function searchAllRecalls(query, limit = 50) {
  const term = String(query).trim().replace(/[*,()]/g, ' ');
  if (term.length < 3) return [];
  const pattern = encodeURIComponent(`*${term}*`);
  const rows = await get(`recalls?select=${encodeURIComponent(FIELDS)}&search_text=ilike.${pattern}&order=published_at.desc&limit=${limit}`);
  return rows.map(fromRow);
}
