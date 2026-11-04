// Loads older recalls (two years) from each source, a batch at a time, oldest first.
// It runs inside collect-recalls after the usual collection, so the library fills up over a day or two
// without slowing anything down. Backfilled recalls are saved but never trigger alerts.
//
// Each source keeps its place in the backfill_state table: the date it started from and how many
// items it has worked through. Newer items only ever appear at the end of the list, so the count stays valid.

import type { Recall } from './types.ts';
import { FSA_BASE, fsaRecallsFor } from './fsa.ts';
import { GOVUK, normaliseOpssItem } from './opss.ts';
import { normaliseMhraItem } from './mhra.ts';
import { isVmdRecallTitle, normaliseVmdItem } from './vmd.ts';
import { FSN_ALERT_TYPE, homeFsnsFrom } from './mhra-fsn.ts';
import { euReportsSince, fetchEuReports } from './eu.ts';
import { asArray, getJson, mapLimit, type FetchFn, type Json } from './util.ts';

export const BACKFILL_DAYS = 730;

export type BackfillState = { key: string; fromDate: string; offset: number; done: boolean };
export type BackfillBatch = { recalls: Recall[]; scanned: number; done: boolean };

type Step = (fetchFn: FetchFn, fromDate: string, offset: number) => Promise<BackfillBatch>;

/** A GOV.UK finder, read oldest first from `fromDate`, `batch` items at a time. */
function govuk(filter: string, batch: number, convert: (content: Json) => Recall[], keep: (r: Json) => boolean = () => true): Step {
  return async (fetchFn, fromDate, offset) => {
    const url = `${GOVUK}/api/search.json?${filter}&filter_public_timestamp=from:${fromDate}` +
      `&order=public_timestamp&count=${batch}&start=${offset}&fields=link,public_timestamp,title`;
    const page = await getJson(fetchFn, url);
    const results = asArray<Json>(page.results);
    const links = results.filter((r) => typeof r.link === 'string' && keep(r)).map((r) => r.link as string);
    const contents = await mapLimit(links, 4, (link) => getJson(fetchFn, `${GOVUK}/api/content${link}`).catch(() => null));
    const recalls = contents
      .filter((c): c is Json => !!c && !(c.withdrawn_notice && Object.keys(c.withdrawn_notice).length))
      .flatMap((c) => { try { return convert(c); } catch { return []; } });
    return { recalls, scanned: results.length, done: results.length < batch };
  };
}

const fsaStep: Step = async (fetchFn, fromDate, offset) => {
  const batch = 40;
  const list = await getJson(fetchFn, `${FSA_BASE}?since=${encodeURIComponent(`${fromDate}T00:00:00Z`)}&_sort=created&_limit=${batch}&_offset=${offset}`);
  const items = asArray<Json>(list.items);
  return { recalls: await fsaRecallsFor(fetchFn, items), scanned: items.length, done: items.length < batch };
};

/** EU Safety Gate: two weekly reports at a time. A report that fails is tried again next run. */
const euStep: Step = async (fetchFn, fromDate, offset) => {
  const reports = await euReportsSince(fetchFn, fromDate);
  const { recalls, fetched } = await fetchEuReports(fetchFn, reports.slice(offset, offset + 2));
  return { recalls, scanned: fetched, done: offset + fetched >= reports.length };
};

export const BACKFILL_STEPS: Record<string, Step> = {
  fsa: fsaStep,
  opss: govuk('filter_format=product_safety_alert_report_recall', 40, (c) => [normaliseOpssItem(c)]),
  'mhra-recalls': govuk('filter_format=medical_safety_alert&filter_alert_type=medicines-recall-notification', 40, (c) => [normaliseMhraItem(c)]),
  'mhra-devices': govuk('filter_format=medical_safety_alert&filter_alert_type=device-safety-information', 40, (c) => [normaliseMhraItem(c)]),
  'mhra-fsn': govuk(`filter_format=medical_safety_alert&filter_alert_type=${FSN_ALERT_TYPE}`, 6, homeFsnsFrom),
  vmd: govuk('filter_organisations=veterinary-medicines-directorate&filter_content_store_document_type=news_story', 40,
    (c) => (isVmdRecallTitle(String(c.title ?? '')) ? [normaliseVmdItem(c)] : []),
    (r) => isVmdRecallTitle(String(r.title ?? ''))),
  eu: euStep,
};

export function backfillStartDate(now = new Date()): string {
  return new Date(now.getTime() - BACKFILL_DAYS * 86400_000).toISOString().slice(0, 10);
}

/**
 * Runs one batch for each source that isn't finished, while time allows.
 * `save` stores recalls (without alerts); `load`/`store` read and write each source's place.
 */
export async function runBackfill(opts: {
  fetchFn: FetchFn;
  load: () => Promise<BackfillState[]>;
  store: (state: BackfillState) => Promise<void>;
  save: (recalls: Recall[]) => Promise<void>;
  deadline: number; // ms timestamp: start no new batch after this
  now?: Date;
}): Promise<Record<string, { saved: number; offset: number; done: boolean; error?: string }>> {
  const report: Record<string, { saved: number; offset: number; done: boolean; error?: string }> = {};
  const states = new Map((await opts.load()).map((s) => [s.key, s]));
  for (const [key, step] of Object.entries(BACKFILL_STEPS)) {
    const state = states.get(key) ?? { key, fromDate: backfillStartDate(opts.now), offset: 0, done: false };
    if (state.done) continue;
    if (Date.now() > opts.deadline) break;
    try {
      const batch = await step(opts.fetchFn, state.fromDate, state.offset);
      if (batch.recalls.length) await opts.save(batch.recalls);
      const next = { ...state, offset: state.offset + batch.scanned, done: batch.done };
      await opts.store(next);
      report[key] = { saved: batch.recalls.length, offset: next.offset, done: next.done };
    } catch (err) {
      report[key] = { saved: 0, offset: state.offset, done: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return report;
}
