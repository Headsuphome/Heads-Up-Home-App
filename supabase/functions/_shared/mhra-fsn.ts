// MHRA Field Safety Notices (FSNs): manufacturers' safety notices for medical devices, published on
// GOV.UK as weekly lists, e.g. "Field Safety Notices: 29 September to 3 October 2025".
// Each notice in a list is an <h3> "Manufacturer: Device", followed by lines for the date, the type of
// device, the model and an "MHRA reference" link to the manufacturer's notice (a PDF).
//
// Most FSNs are for hospital equipment. We keep only devices people use at home, such as glucose
// meters, insulin pens, inhalers, CPAP machines, hearing aids and mobility aids.
// Licence: Open Government Licence v3.0 — attribution required.

import type { Recall } from './types.ts';
import { GOVUK } from './opss.ts';
import { asArray, cleanText, getJson, mapLimit, shorten, toIso, type FetchFn, type Json } from './util.ts';

export const FSN_ALERT_TYPE = 'field-safety-notices';

const HOME_DEVICE = new RegExp(String.raw`\b(` + [
  'blood glucose', 'glucose (?:meter|monitor|sensor|test)', 'continuous glucose', 'cgm', 'freestyle libre', 'libre',
  'dexcom', 'omnipod', 'ketone', 'test strips?', 'lancets?', 'lancing device', 'insulin', 'pen needles?',
  'injection pen', 'auto-?injector', 'adrenaline', 'epinephrine', 'epipen', 'inhalers?', 'spacer', 'nebuli[sz]ers?',
  'c?pap', 'sleep apn(?:o)?ea', 'hearing aids?', 'sound processor', 'cochlear', 'contact lens(?:es)?',
  'thermometers?', 'blood pressure monitor', 'sphygmomanometer', 'pulse oximeter', 'oximeter', 'pregnancy test',
  'ovulation', 'self[- ]test(?:ing)?', 'home use', 'home test', 'lateral flow', 'wheelchairs?', 'mobility scooters?',
  'walking (?:aid|frame|stick)s?', 'rollators?', 'crutch(?:es)?', 'stair ?lifts?', 'commodes?', 'bath lifts?',
  'shower chairs?', 'ostomy', 'stoma', 'colostomy', 'ileostomy', 'urostomy', 'intermittent catheters?',
  'incontinence', 'breast pumps?', 'tens\b', 'oxygen concentrators?', 'home (?:dialysis|oxygen|ventilat\w*)',
  'peritoneal dialysis', 'defibrillators?', '\baed\b', 'condoms?', 'personal alarm', 'hospital bed for home',
].join('|') + String.raw`)`, 'i');

const HOSPITAL_ONLY = /\b(professional|hospital|surgical|surgery|theatre|x-?ray|mri\b|ct scanner|fluoroscop\w*|radiograph\w*|radiotherapy|endoscop\w*|anaesthe\w*|laborator\w*|analy[sz]er|stereotactic|apheresis|central venous|cardiac|catheter lab|implant\w*|ultrasound system|patient monitor)\b/i;

export type FsnEntry = {
  manufacturer: string | null;
  device: string;
  heading: string;
  anchor: string | null;
  date: string | null;
  deviceType: string | null;
  model: string | null;
  ref: string | null;
  documentUrl: string | null;
};

/** Splits a weekly FSN list into its notices. */
export function parseFsnList(html: string): FsnEntry[] {
  const out: FsnEntry[] = [];
  const parts = html.split(/<h3\b/i).slice(1);
  for (const part of parts) {
    const [headHtml, ...rest] = part.split(/<\/h3>/i);
    const anchor = headHtml.match(/id="([^"]+)"/)?.[1] ?? null;
    const heading = cleanText(headHtml.replace(/^[^>]*>/, '')) ?? '';
    if (!heading) continue;
    const body = rest.join(' ');
    const lines = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({ html: m[1], text: cleanText(m[1]) ?? '' }))
      .filter((l) => l.text);
    // "Manufacturer: Device" — split at the first colon only ("Tandem: t:slim X2 Insulin Pump").
    const split = heading.match(/^([^:]+?)\s*:\s*(.+)$/);
    const manufacturer = split ? split[1] : null;
    const device = split ? split[2] : heading;
    const dateLine = lines.find((l) => /^(\d{1,2}\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(l.text));
    const refLine = lines.find((l) => /MHRA reference/i.test(l.text));
    const modelLines = lines.filter((l) => /^(model|models|lot|lots|batch|serial|ref\b|reference\b|fmi\b|fsca\b)/i.test(l.text)).map((l) => l.text);
    const typeLine = lines.find((l) => l !== dateLine && l !== refLine && !modelLines.includes(l.text) && !/MHRA reference/i.test(l.text));
    out.push({
      manufacturer,
      device,
      heading,
      anchor,
      date: dateLine?.text ?? null,
      deviceType: typeLine?.text ?? null,
      model: modelLines.length ? modelLines.join('\n') : null,
      ref: refLine?.html.match(/>(\d{5,})</)?.[1] ?? refLine?.text.match(/(\d{4}\/\d{3}\/\d{3}\/\d{3}\/\d{3})/)?.[1] ?? null,
      documentUrl: refLine?.html.match(/href="([^"]+)"/)?.[1] ?? null,
    });
  }
  return out;
}

/** True for devices people use at home, rather than hospital equipment. */
export function isHomeDevice(entry: Pick<FsnEntry, 'heading' | 'deviceType' | 'model'>): boolean {
  const text = [entry.heading, entry.deviceType, entry.model].filter(Boolean).join(' ');
  if (!HOME_DEVICE.test(text)) return false;
  if (/\bhome\b/i.test(text)) return true;
  return !HOSPITAL_ONLY.test(text);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "14 October 2026" or "October 2026" → midday UTC on that day (the 1st when there's no day). */
function fsnDate(value: string | null, fallback: string): string {
  const m = value?.match(/^(?:(\d{1,2})\s+)?([A-Za-z]+)\s+(\d{4})$/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return fallback;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1] ?? 1), 12)).toISOString();
}

/** Converts one notice from a weekly list into our Recall format. */
export function normaliseFsn(entry: FsnEntry, pageUrl: string, pagePublished: string): Recall {
  const publishedAt = fsnDate(entry.date, pagePublished);
  const key = (entry.ref ?? entry.anchor ?? entry.heading).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60);
  const what = entry.deviceType ? ` (${entry.deviceType.replace(/\.$/, '')})` : '';
  return {
    id: `mhra-fsn:${key}`,
    source: 'mhra',
    sourceRef: entry.ref ?? key,
    alertType: 'field-safety-notice',
    title: entry.manufacturer ? `${entry.device} (${entry.manufacturer})` : entry.device,
    summary: shorten(`The manufacturer has issued a field safety notice for this device${what}. The notice explains the problem and what to do.`),
    advice: "Read the manufacturer's notice. If you use this device, contact the supplier, your pharmacist or the clinic that gave it to you. Don't stop using a device you rely on without advice.",
    riskLevel: null,
    categories: ['medicines'],
    allergens: [],
    businesses: entry.manufacturer ? [entry.manufacturer] : [],
    sourceUrl: entry.anchor ? `${pageUrl}#${entry.anchor}` : pageUrl,
    documentUrl: entry.documentUrl,
    imageUrl: null,
    publishedAt,
    updatedAt: publishedAt,
    products: [{
      name: entry.device,
      barcode: null,
      packSize: null,
      batchCodes: [],
      bestBefore: null,
      useBy: null,
      batchNotes: entry.model,
    }],
  };
}

/** Home-device notices from one weekly list (its GOV.UK content item). */
export function homeFsnsFrom(content: Json): Recall[] {
  const pageUrl = `${GOVUK}${content.base_path ?? ''}`;
  const published = toIso(content.first_published_at ?? content.public_updated_at);
  return parseFsnList(content.details?.body ?? '').filter(isHomeDevice).map((e) => normaliseFsn(e, pageUrl, published));
}

/** Weekly FSN lists published since `since`, reduced to devices people use at home. */
export async function fetchFsnSince(fetchFn: FetchFn, since: string, maxPages = 10): Promise<Recall[]> {
  const url = `${GOVUK}/api/search.json?filter_format=medical_safety_alert&filter_alert_type=${FSN_ALERT_TYPE}` +
    `&filter_public_timestamp=from:${since.slice(0, 10)}&order=-public_timestamp&count=${maxPages}&fields=link,public_timestamp`;
  const page = await getJson(fetchFn, url);
  const links = asArray<Json>(page.results).filter((r) => typeof r.link === 'string').map((r) => r.link as string);
  const contents = await mapLimit(links, 3, (link) => getJson(fetchFn, `${GOVUK}/api/content${link}`).catch(() => null));
  return contents.filter(Boolean).flatMap((c) => homeFsnsFrom(c));
}
