import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromRow, badgeFor, friendlyDate, tokens, cupboardConfidence, cupboardMatches,
  relevance, filterRecalls, searchRecalls,
} from '../src/logic.js';

const oatRow = {
  id: 'fsa:FSA-PRIN-45-2026', source: 'fsa', alert_type: 'recall',
  title: 'Waitrose recalls Waitrose Essential Unsweetened Oat Drink because of poor temperature control',
  summary: 'May be unsafe to drink.', advice: 'Return it for a refund.', risk_level: null,
  categories: ['food-drink'], allergens: [], businesses: ['Waitrose'],
  source_url: 'https://www.food.gov.uk/news-alerts/alert/fsa-prin-45-2026', published_at: '2026-10-14T09:00:00Z',
  recall_products: [{ name: 'Waitrose Essential Unsweetened Oat Drink', barcode: '5000169123456', pack_size: '1 litre', batch_codes: [], best_before: '29 October 2026', use_by: null, batch_notes: null }],
};
const cookiesRow = {
  ...oatRow, id: 'fsa:FSA-AA-50-2026', alert_type: 'allergy', title: 'Little Bakes recalls Kids Mini Cookies',
  categories: ['food-drink', 'baby-children'], allergens: ['milk', 'eggs'], businesses: ['Little Bakes'],
  recall_products: [{ name: 'Little Bakes Kids Mini Cookies', batch_codes: ['LB2241'] }],
};
const chargerRow = {
  ...oatRow, id: 'opss:2609-0076', source: 'opss', alert_type: 'safety-report', title: 'USB-C wall charger, 65W',
  risk_level: 'serious', categories: ['electrical'], businesses: [], recall_products: [{ name: 'USB-C wall charger, 65W', batch_codes: [] }],
};
const [oat, cookies, charger] = [oatRow, cookiesRow, chargerRow].map(fromRow);
const item = (o) => ({ id: 'i1', name: '', brand: null, barcode: null, dismissed: [], ...o });
const prefs = (o) => ({ categories: [], allergens: [], cupboard: [], ...o });

test('database rows become screen-ready recalls', () => {
  assert.equal(oat.sourceUrl, oatRow.source_url);
  assert.equal(oat.products[0].packSize, '1 litre');
  assert.deepEqual(oat.products[0].batchCodes, []);
});

test('badges say what kind of risk it is', () => {
  assert.deepEqual(badgeFor(oat), { text: 'Food recall', tone: 'info' });
  assert.deepEqual(badgeFor(cookies), { text: 'Allergy · Milk, Eggs', tone: 'warning' });
  assert.deepEqual(badgeFor(charger), { text: 'Serious risk', tone: 'danger' });
});

test('dates read naturally', () => {
  const now = new Date('2026-10-15T11:00:00');
  assert.equal(friendlyDate('2026-10-15T08:00:00', now), 'Today');
  assert.equal(friendlyDate('2026-10-14T20:00:00', now), 'Yesterday');
  assert.equal(friendlyDate('2026-10-12T10:00:00', now), '3 days ago');
  assert.equal(friendlyDate('2026-09-02T10:00:00', now), '2 Sep');
  assert.equal(friendlyDate('2025-12-25T10:00:00', now), '25 Dec 2025');
});

test('cupboard matching mirrors the backend', () => {
  assert.deepEqual(tokens('Little Bakes Kids Mini Cookies 6 x 20 g'), ['little', 'bake', 'kid', 'mini', 'cookie', '20g']);
  assert.equal(cupboardConfidence(item({ name: 'Oat milk', barcode: '05000169123456' }), oat), 'barcode');
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Waitrose' }), oat), 'likely');
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Oatly' }), oat), null);
  assert.equal(cupboardConfidence(item({ name: 'Oat Drink' }), oat), 'possible');
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Waitrose', dismissed: [oat.id] }), oat), null);
});

test('best cupboard match comes first', () => {
  const found = cupboardMatches(
    [item({ id: 'a', name: 'Oat Drink' }), item({ id: 'b', name: 'Mini Cookies', brand: 'Little Bakes' })],
    [oat, cookies, charger],
  );
  assert.deepEqual(found.map((m) => [m.item.id, m.recall.id, m.confidence]), [
    ['b', cookies.id, 'likely'],
    ['a', oat.id, 'possible'],
  ]);
});

test('"For you" shows cupboard, allergen and category recalls only', () => {
  const p = prefs({ allergens: ['milk'], categories: ['electrical'] });
  assert.equal(relevance(cookies, p, new Set()), 'allergen');
  assert.equal(relevance(charger, p, new Set()), 'category');
  assert.equal(relevance(oat, p, new Set([oat.id])), 'cupboard');
  assert.deepEqual(filterRecalls([oat, cookies, charger], 'for-you', p, new Set()).map((r) => r.id), [cookies.id, charger.id]);
  // With nothing chosen yet, "For you" shows everything rather than an empty screen.
  assert.equal(filterRecalls([oat, cookies, charger], 'for-you', prefs({}), new Set()).length, 3);
  assert.deepEqual(filterRecalls([oat, cookies, charger], 'baby-children', p, new Set()).map((r) => r.id), [cookies.id]);
});

test('search matches title, brand and product names', () => {
  assert.deepEqual(searchRecalls([oat, cookies, charger], 'waitrose oat').map((r) => r.id), [oat.id]);
  assert.deepEqual(searchRecalls([oat, cookies, charger], 'CHARGER').map((r) => r.id), [charger.id]);
  assert.equal(searchRecalls([oat, cookies, charger], '').length, 3);
});

import { iconFor, firstBarcode } from '../src/logic.js';

test('photos: fallback icon and barcode helpers', () => {
  assert.equal(iconFor(charger), 'flash-outline');
  assert.equal(iconFor(cookies), 'restaurant-outline', 'food icon beats the baby category');
  assert.equal(iconFor({ categories: [] }), 'ellipsis-horizontal-circle-outline');
  assert.equal(firstBarcode(oat), '5000169123456');
  assert.equal(firstBarcode(cookies), null);
  assert.equal(fromRow({ ...oatRow, image_url: 'https://x/y.jpg' }).imageUrl, 'https://x/y.jpg');
  assert.equal(oat.imageUrl, null);
});

import { sourceName, sourceShort } from '../src/logic.js';

test('medicines and Scotland sources are labelled clearly', () => {
  const med = fromRow({ ...oatRow, id: 'mhra:EL26A41', source: 'mhra', alert_type: 'recall', risk_level: 'medium', categories: ['medicines'] });
  assert.deepEqual(badgeFor(med), { text: 'Medicine recall', tone: 'warning' });
  assert.deepEqual(badgeFor({ ...med, riskLevel: 'serious' }), { text: 'Urgent medicine recall', tone: 'danger' });
  assert.deepEqual(badgeFor({ ...med, alertType: 'safety-alert', riskLevel: null }), { text: 'Health device alert', tone: 'warning' });
  assert.equal(iconFor(med), 'medkit-outline');
  const scot = fromRow({ ...oatRow, id: 'fss:x', source: 'fss' });
  assert.deepEqual(badgeFor(scot), { text: 'Food recall', tone: 'info' });
  assert.equal(sourceShort('fss'), 'FSS');
  assert.equal(sourceName('mhra'), 'Medicines and Healthcare products Regulatory Agency');
});

import { primaryCategory, recentCount } from '../src/logic.js';

test('colour and summary helpers', () => {
  assert.equal(primaryCategory(cookies), 'food-drink');
  assert.equal(primaryCategory({ categories: ['baby-children'] }), 'baby-children');
  assert.equal(primaryCategory({ categories: [] }), 'other');
  const now = new Date('2026-10-15T12:00:00Z');
  const list = [{ publishedAt: '2026-10-14T00:00:00Z' }, { publishedAt: '2026-10-09T00:00:00Z' }, { publishedAt: '2026-09-01T00:00:00Z' }];
  assert.equal(recentCount(list, 7, now), 2);
  assert.equal(recentCount(list, 2, now), 1);
  assert.equal(recentCount(list, 1, now), 0);
});
