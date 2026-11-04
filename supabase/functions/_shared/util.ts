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

const USER_AGENT = 'HeadsUpHome/1.0 (recall alerts)';
const TIMEOUT_MS = 30_000; // a stuck download gives up rather than holding up the whole run

/** A server's "no" (as opposed to a dropped connection), with its status code. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** True for answers that won't change if we ask again (404 and friends). */
export function isPermanent(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429;
}

/** Tries `fn` up to `attempts` times, waiting a little longer each time. Doesn't retry permanent errors. */
async function withRetries<T>(attempts: number, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isPermanent(err)) break;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw lastError;
}

async function request(fetchFn: FetchFn, url: string, accept: string): Promise<Response> {
  const res = await fetchFn(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
  return res;
}

/** Fetches a web page as text (for sources with no data feed). A dropped download is tried again. */
export async function getText(fetchFn: FetchFn, url: string, attempts = 3): Promise<string> {
  return await withRetries(attempts, async () => await (await request(fetchFn, url, 'text/html')).text());
}

/**
 * Reads a page from the top and stops as soon as `enough(textSoFar)` says it has what it needs,
 * so a long list (newest first) doesn't have to be downloaded in full. Returns the whole page if it ends first.
 */
export async function getTextUntil(fetchFn: FetchFn, url: string, enough: (text: string) => boolean, attempts = 3): Promise<string> {
  return await withRetries(attempts, async () => {
    const res = await request(fetchFn, url, 'text/html');
    if (!res.body) return await res.text();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text;
        text += value;
        if (enough(text)) return text;
      }
    } finally {
      reader.cancel().catch(() => {}); // stop the rest of the download
    }
  });
}

export async function getJson(fetchFn: FetchFn, url: string, attempts = 3): Promise<Json> {
  return await withRetries(attempts, async () => await (await request(fetchFn, url, 'application/json')).json());
}
