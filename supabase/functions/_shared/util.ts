// Small helpers for the messy reality of government data:
// fields that are sometimes a list and sometimes a single value, HTML in text, etc.

// deno-lint-ignore no-explicit-any
export type Json = any;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Always returns an array, whether given nothing, one value or a list. */
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** First non-empty string among the values given. */
export function firstText(...values: unknown[]): string | null {
  for (const v of values) {
    for (const item of asArray(v as unknown)) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  return null;
}

/** Strips HTML and Markdown-ish noise and collapses whitespace. */
export function cleanText(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return text || null;
}

/** Shortens text to a whole sentence or word within the limit. */
export function shorten(text: string | null, max = 280): string | null {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  if (sentenceEnd > max * 0.5) return cut.slice(0, sentenceEnd + 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

/** Normalises any date string the agencies use into ISO 8601. */
export function toIso(value: string | null | undefined, fallback?: string): string {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback ?? new Date().toISOString();
}

/** Runs `fn` over items with at most `limit` running at once (polite to government servers). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Fetches a web page as text (for sources with no data feed). */
export async function getText(fetchFn: FetchFn, url: string): Promise<string> {
  const res = await fetchFn(url, { headers: { Accept: 'text/html', 'User-Agent': 'HeadsUpHome/1.0 (recall alerts)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

export async function getJson(fetchFn: FetchFn, url: string, attempts = 3): Promise<Json> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(url, { headers: { Accept: 'application/json', 'User-Agent': 'HeadsUpHome/1.0 (recall alerts)' } });
      if (res.ok) return await res.json();
      lastError = new Error(`${res.status} ${res.statusText} for ${url}`);
      if (res.status < 500 && res.status !== 429) break; // don't retry client errors
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw lastError;
}
