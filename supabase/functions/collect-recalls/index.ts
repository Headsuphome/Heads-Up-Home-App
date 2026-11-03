// collect-recalls: the engine. Runs every hour (see migrations/0002_schedule.sql).
//
// 1. Asks every source (FSA, FSS, OPSS, MHRA, VMD, HSE, EU Safety Gate) for anything new since last run
// 2. Saves it in our own format
// 3. Works out who should be told (cupboard, allergens, categories)
// 4. Sends phone notifications (category alerts wait for the daily digest if the person chose that)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchFsaSince } from '../_shared/fsa.ts';
import { fetchOpssSince } from '../_shared/opss.ts';
import { fetchMhraSince } from '../_shared/mhra.ts';
import { fetchFssSince } from '../_shared/fss.ts';
import { fetchVmdSince } from '../_shared/vmd.ts';
import { fetchFsnSince } from '../_shared/mhra-fsn.ts';
import { fetchHseSince } from '../_shared/hse.ts';
import { fetchEuSince } from '../_shared/eu.ts';
import { runBackfill, type BackfillState } from '../_shared/backfill.ts';
import { matchRecall, notificationText } from '../_shared/matching.ts';
import { sendPush, type PushMessage } from '../_shared/push.ts';
import type { CupboardItem, Match, Recall, UserProfile } from '../_shared/types.ts';
import { bestPhoto, downloadPdf, imagePath } from '../_shared/images.ts';
import { mapLimit } from '../_shared/util.ts';

const PHOTOS_PER_RUN = 25; // the rest are picked up on later hourly runs
const PHOTO_BUCKET = 'recall-images';

/**
 * Finds recalls that have a notice PDF but no photo yet, pulls the product photo out of
 * the PDF, and stores it in Supabase Storage. Each recall is tried once, so a PDF without
 * a usable photo isn't downloaded every hour.
 */
async function addPhotos(db: Db): Promise<{ added: number; checked: number }> {
  const { data: todo, error } = await db
    .from('recalls')
    .select('id, document_url')
    .is('image_url', null)
    .is('image_checked_at', null)
    .not('document_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(PHOTOS_PER_RUN);
  if (error) throw error;

  const results = await mapLimit(todo ?? [], 3, async (row: { id: string; document_url: string }) => {
    let imageUrl: string | null = null;
    try {
      const pdf = await downloadPdf(fetch, row.document_url);
      const photo = pdf ? bestPhoto(pdf) : null;
      if (photo) {
        const path = imagePath(row.id);
        const { error: upErr } = await db.storage.from(PHOTO_BUCKET).upload(path, photo.jpeg, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) imageUrl = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      }
    } catch {
      // A broken or unusual PDF just means no photo for this recall.
    }
    await db.from('recalls').update({ image_url: imageUrl, image_checked_at: new Date().toISOString() }).eq('id', row.id);
    return imageUrl ? 1 : 0;
  });
  return { added: results.reduce((a: number, b: number) => a + b, 0), checked: results.length };
}

const FIRST_RUN_DAYS = 30; // history to load the very first time, so the app isn't empty at launch
// Pet medicine recalls are rare (a handful a year) and the VMD withdraws each notice once its recall
// is over, so a year of history gives just the recalls that still apply.
// HSE publishes only a few alerts a year, so it starts with two years.
const FIRST_RUN_DAYS_BY_SOURCE: Record<string, number> = { vmd: 365, hse: 730 };
// Older recalls are loaded separately, a batch each run (see backfill.ts). This is how long the
// backfill may keep starting new batches, so the whole run stays well inside its time limit.
const BACKFILL_SECONDS = 55;

type Db = SupabaseClient;

function recallRow(r: Recall) {
  return {
    id: r.id, source: r.source, source_ref: r.sourceRef, alert_type: r.alertType,
    title: r.title, summary: r.summary, advice: r.advice, risk_level: r.riskLevel,
    categories: r.categories, allergens: r.allergens, businesses: r.businesses,
    source_url: r.sourceUrl, document_url: r.documentUrl, published_at: r.publishedAt, updated_at: r.updatedAt,
  };
}

async function saveRecalls(db: Db, recalls: Recall[]): Promise<Recall[]> {
  if (recalls.length === 0) return [];
  const ids = recalls.map((r) => r.id);
  const { data: existing, error: readErr } = await db.from('recalls').select('id').in('id', ids);
  if (readErr) throw readErr;
  const known = new Set((existing ?? []).map((e: { id: string }) => e.id));

  // image_url is only written when the source gives a photo, so one we've already extracted from a
  // PDF is never wiped. The two groups go separately because an upsert writes the same columns for every row.
  const checkedAt = new Date().toISOString();
  const withPhoto = recalls.filter((r) => r.imageUrl).map((r) => ({ ...recallRow(r), image_url: r.imageUrl, image_checked_at: checkedAt }));
  const withoutPhoto = recalls.filter((r) => !r.imageUrl).map(recallRow);
  for (const rows of [withPhoto, withoutPhoto]) {
    if (!rows.length) continue;
    const { error: upsertErr } = await db.from('recalls').upsert(rows);
    if (upsertErr) throw upsertErr;
  }

  // Products are replaced wholesale: agencies sometimes add batches to an existing notice.
  const { error: delErr } = await db.from('recall_products').delete().in('recall_id', ids);
  if (delErr) throw delErr;
  const productRows = recalls.flatMap((r) => r.products.map((p) => ({
    recall_id: r.id, name: p.name, barcode: p.barcode, pack_size: p.packSize,
    batch_codes: p.batchCodes, best_before: p.bestBefore, use_by: p.useBy, batch_notes: p.batchNotes,
  })));
  if (productRows.length) {
    const { error: insErr } = await db.from('recall_products').insert(productRows);
    if (insErr) throw insErr;
  }
  return recalls.filter((r) => !known.has(r.id));
}

async function collectSource(db: Db, source: string, fetcher: typeof fetchFsaSince): Promise<{ newRecalls: Recall[]; firstRun: boolean; error?: string }> {
  const { data: state } = await db.from('sync_state').select('*').eq('source', source).maybeSingle();
  const firstRun = !state?.last_seen_at;
  const firstRunDays = FIRST_RUN_DAYS_BY_SOURCE[source] ?? FIRST_RUN_DAYS;
  const since = state?.last_seen_at ?? new Date(Date.now() - firstRunDays * 86400_000).toISOString();
  const runStarted = new Date().toISOString();
  try {
    const recalls = await fetcher(fetch, since);
    const newRecalls = await saveRecalls(db, recalls);
    const latest = recalls.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), since);
    await db.from('sync_state').upsert({ source, last_seen_at: latest, last_run_at: runStarted, last_error: null });
    return { newRecalls, firstRun };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('sync_state').upsert({ source, last_seen_at: state?.last_seen_at ?? null, last_run_at: runStarted, last_error: message });
    return { newRecalls: [], firstRun, error: message };
  }
}

async function findMatches(db: Db, recall: Recall): Promise<Match[]> {
  const { data: profileRows, error: pErr } = await db
    .from('profiles')
    .select('user_id, categories, allergens, alert_timing')
    .or(`categories.ov.{${recall.categories.join(',')}},allergens.ov.{${recall.allergens.join(',') || '_none_'}}`);
  if (pErr) throw pErr;
  const profiles: UserProfile[] = (profileRows ?? []).map((p: Record<string, unknown>) => ({
    userId: p.user_id as string, categories: p.categories as string[],
    allergens: p.allergens as string[], alertTiming: p.alert_timing as 'instant' | 'daily',
  }));

  const { data: itemRows, error: cErr } = await db.rpc('cupboard_candidates', { p_recall_id: recall.id });
  if (cErr) throw cErr;
  const cupboard: CupboardItem[] = (itemRows ?? []).map((i: Record<string, unknown>) => ({
    id: i.id as number, userId: i.user_id as string, name: i.name as string,
    brand: (i.brand as string) ?? null, barcode: (i.barcode as string) ?? null,
    dismissedRecalls: (i.dismissed_recalls as string[]) ?? [],
  }));

  return matchRecall(recall, profiles, cupboard);
}

async function notify(db: Db, recall: Recall, matches: Match[], cupboardNames: Map<number, string>) {
  if (matches.length === 0) return { alerts: 0, pushed: 0 };

  const { data: inserted, error } = await db
    .from('user_alerts')
    .upsert(matches.map((m) => ({
      user_id: m.userId, recall_id: m.recallId, reason: m.reason,
      confidence: m.confidence, cupboard_item_id: m.cupboardItemId,
    })), { onConflict: 'user_id,recall_id', ignoreDuplicates: true })
    .select('id, user_id, reason');
  if (error) throw error;
  if (!inserted?.length) return { alerts: 0, pushed: 0 };

  // Cupboard and allergen alerts always go out straight away — they're about safety.
  // Category alerts respect the person's "daily summary" choice.
  const userIds = [...new Set(inserted.map((a: { user_id: string }) => a.user_id))];
  const { data: timings } = await db.from('profiles').select('user_id, alert_timing').in('user_id', userIds);
  const daily = new Set((timings ?? []).filter((t: { alert_timing: string }) => t.alert_timing === 'daily').map((t: { user_id: string }) => t.user_id));
  const toPush = inserted.filter((a: { user_id: string; reason: string }) => a.reason !== 'category' || !daily.has(a.user_id));
  if (!toPush.length) return { alerts: inserted.length, pushed: 0 };

  const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', toPush.map((a: { user_id: string }) => a.user_id));
  const matchByUser = new Map(matches.map((m) => [m.userId, m]));
  const messages: PushMessage[] = (tokens ?? []).map((t: { token: string; user_id: string }) => {
    const m = matchByUser.get(t.user_id)!;
    const text = notificationText(recall, m, m.cupboardItemId ? cupboardNames.get(m.cupboardItemId) : undefined);
    return { to: t.token, ...text, data: { recallId: recall.id } };
  });

  const { sent, deadTokens, errors: pushErrors } = await sendPush(fetch, messages, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined);
  if (pushErrors.length) console.error('Some alerts could not be sent:', pushErrors);
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  await db.from('user_alerts').update({ pushed_at: new Date().toISOString() }).in('id', toPush.map((a: { id: number }) => a.id));
  return { alerts: inserted.length, pushed: sent };
}

Deno.serve(async (req) => {
  // Only our scheduler may run this.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorised', { status: 401 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const report: Record<string, unknown> = {};
  const started = Date.now();
  // Each entry keeps its own place in sync_state, so the name doesn't have to be a recall source.
  const SOURCES: Array<[string, typeof fetchFsaSince]> = [
    ['fsa', fetchFsaSince],
    ['opss', fetchOpssSince],
    ['mhra', fetchMhraSince],
    ['mhra-fsn', fetchFsnSince],
    ['vmd', fetchVmdSince],
    ['fss', fetchFssSince],
    ['hse', fetchHseSince],
    ['eu', fetchEuSince],
  ];
  const results = await Promise.all(SOURCES.map(([source, fetcher]) => collectSource(db, source, fetcher)));

  let alerts = 0;
  let pushed = 0;
  const errors: string[] = [];
  for (const [i, result] of results.entries()) {
    const source = SOURCES[i][0];
    report[source] = { newRecalls: result.newRecalls.length, firstRun: result.firstRun, error: result.error ?? null };
    if (result.error) errors.push(`${source}: ${result.error}`);
    // The first run loads history — don't notify anyone about old recalls.
    if (result.firstRun) continue;

    for (const recall of result.newRecalls) {
      try {
        const matches = await findMatches(db, recall);
        const itemIds = matches.map((m) => m.cupboardItemId).filter((id): id is number => id !== null);
        const names = new Map<number, string>();
        if (itemIds.length) {
          const { data } = await db.from('cupboard_items').select('id, name').in('id', itemIds);
          for (const row of data ?? []) names.set(row.id, row.name);
        }
        const r = await notify(db, recall, matches, names);
        alerts += r.alerts;
        pushed += r.pushed;
      } catch (err) {
        errors.push(`${recall.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Older recalls, a batch per source each run. Saved quietly: no alerts for these.
  try {
    report.backfill = await runBackfill({
      fetchFn: fetch,
      deadline: started + BACKFILL_SECONDS * 1000,
      load: async () => {
        const { data, error } = await db.from('backfill_state').select('key, from_date, next_offset, done');
        if (error) throw error;
        return (data ?? []).map((r: { key: string; from_date: string; next_offset: number; done: boolean }) =>
          ({ key: r.key, fromDate: r.from_date, offset: r.next_offset, done: r.done }) as BackfillState);
      },
      store: async (s) => {
        const { error } = await db.from('backfill_state').upsert({
          key: s.key, from_date: s.fromDate, next_offset: s.offset, done: s.done, updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      },
      save: async (recalls) => { await saveRecalls(db, recalls); },
    });
  } catch (err) {
    errors.push(`backfill: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    report.photos = await addPhotos(db);
  } catch (err) {
    errors.push(`photos: ${err instanceof Error ? err.message : String(err)}`);
  }

  report.alertsCreated = alerts;
  report.notificationsSent = pushed;
  report.errors = errors;
  return new Response(JSON.stringify(report, null, 2), {
    status: errors.length ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
