// Runs every collector against the real sources (as the hourly engine would) and saves what came back.
// Usage: node scripts/live-check.ts <out dir>
//    or: deno run -A scripts/live-check.ts <out dir>   (the runtime Supabase uses)
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchFsaSince } from '../supabase/functions/_shared/fsa.ts';
import { fetchOpssSince } from '../supabase/functions/_shared/opss.ts';
import { fetchMhraSince } from '../supabase/functions/_shared/mhra.ts';
import { fetchFsnSince } from '../supabase/functions/_shared/mhra-fsn.ts';
import { fetchVmdSince } from '../supabase/functions/_shared/vmd.ts';
import { fetchFssSince } from '../supabase/functions/_shared/fss.ts';
import { fetchHseSince } from '../supabase/functions/_shared/hse.ts';
import { fetchEuSince } from '../supabase/functions/_shared/eu.ts';
import { BACKFILL_STEPS, backfillStartDate } from '../supabase/functions/_shared/backfill.ts';
import type { Recall } from '../supabase/functions/_shared/types.ts';

const out = process.argv[2] ?? 'out/live';
await mkdir(out, { recursive: true });
const days = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const summary: Record<string, unknown> = {};

function brief(r: Recall) {
  return { id: r.id, title: r.title, publishedAt: r.publishedAt, categories: r.categories, risk: r.riskLevel,
    summary: r.summary?.slice(0, 160), advice: r.advice?.slice(0, 160), products: r.products.map((p) => ({ name: p.name, barcode: p.barcode, batches: p.batchCodes.slice(0, 5), notes: p.batchNotes?.slice(0, 80) })),
    sourceUrl: r.sourceUrl, documentUrl: r.documentUrl, imageUrl: r.imageUrl };
}

async function check(name: string, fn: () => Promise<Recall[]>) {
  const t = Date.now();
  try {
    const recalls = await fn();
    const cats: Record<string, number> = {};
    for (const r of recalls) for (const c of r.categories) cats[c] = (cats[c] ?? 0) + 1;
    summary[name] = { count: recalls.length, seconds: (Date.now() - t) / 1000, categories: cats, sample: recalls.slice(0, 3).map(brief) };
    await writeFile(`${out}/${name}.json`, JSON.stringify(recalls.map(brief), null, 1));
    console.log(`${name}: ${recalls.length} in ${(Date.now() - t) / 1000}s`);
  } catch (e) {
    summary[name] = { error: String(e), seconds: (Date.now() - t) / 1000 };
    console.log(`${name}: ERROR ${e}`);
  }
}

const f = fetch as typeof fetch;
await check('fsa', () => fetchFsaSince(f, days(30)));
await check('opss', () => fetchOpssSince(f, days(30)));
await check('mhra', () => fetchMhraSince(f, days(30)));
await check('mhra-fsn', () => fetchFsnSince(f, days(30)));
await check('vmd', () => fetchVmdSince(f, days(365)));
await check('fss', () => fetchFssSince(f, days(30)));
await check('hse', () => fetchHseSince(f, days(730)));
await check('eu', () => fetchEuSince(f, days(30)));

const from = backfillStartDate();
for (const [key, step] of Object.entries(BACKFILL_STEPS)) {
  await check(`backfill-${key}`, async () => {
    const batch = await step(f, from, 0);
    summary[`backfill-${key}-batch`] = { scanned: batch.scanned, done: batch.done };
    return batch.recalls;
  });
}

await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 1));
