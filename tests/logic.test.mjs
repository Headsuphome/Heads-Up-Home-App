import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromRow, badgeFor, friendlyDate, tokens, cupboardConfidence, cupboardMatches,
  relevance, filterRecalls, searchRecalls, cleanBarcode, barcodeVariants, recallsWithBarcode, impactStats,
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
  assert.deepEqual(badgeFor(cookies), { text: 'Allergy · Dairy, Eggs', tone: 'warning' });
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

test('scanned barcodes match recalls however the zeros are written', () => {
  assert.equal(cleanBarcode(' 0 5000169 123456 '), '5000169123456');
  assert.deepEqual(barcodeVariants('5000169123456'), ['5000169123456', '05000169123456']);
  assert.deepEqual(barcodeVariants('012345678905'), ['12345678905', '012345678905', '0012345678905', '00012345678905']);
  assert.deepEqual(barcodeVariants('123'), [], 'too short to be a product barcode');
  assert.deepEqual(recallsWithBarcode([oat, cookies, charger], '05000169123456').map((r) => r.id), [oat.id]);
  assert.deepEqual(recallsWithBarcode([oat, cookies, charger], '5000169999999'), []);
});

test('impact stats count the recalls checked since someone joined', () => {
  const p = prefs({ joinedAt: '2026-10-10T00:00:00Z', allergens: ['milk'], cupboard: [item({ name: 'Oat drink' })], categories: ['electrical'] });
  const s = impactStats([oat, cookies, charger], p, new Set(), new Date('2026-10-20T00:00:00Z'));
  assert.equal(s.checked, 3, 'all three were published after joining');
  assert.equal(s.relevant, 2, 'milk cookies and the electrical charger matter to this household');
  assert.equal(s.days, 10);
  assert.deepEqual([s.cupboard, s.allergens, s.categories], [1, 1, 1]);
  assert.equal(impactStats([oat], prefs({}), new Set()).checked, 0, 'nothing counted before a join date is known');
});

test('pet medicine recalls get their own badge and pets have a category', async () => {
  const { CATEGORIES } = await import('../src/logic.js');
  assert.ok(CATEGORIES.some((c) => c.key === 'pets'));
  const vet = fromRow({ ...oatRow, id: 'vmd:clavudale', source: 'vmd', alert_type: 'recall', categories: ['pets'] });
  assert.deepEqual(badgeFor(vet), { text: 'Pet medicine recall', tone: 'warning' });
});

test('EU warnings stay out of UK lists and counts, but show when they match the cupboard', async () => {
  const { filterRecalls, recentCount, isUkRecall } = await import('../src/logic.js');
  const now = new Date();
  const uk = fromRow({ ...oatRow, id: 'opss:1', source: 'opss', categories: ['electrical'], published_at: now.toISOString() });
  const eu = fromRow({ ...oatRow, id: 'eu:SR-1', source: 'eu', alert_type: 'eu-warning', categories: ['electrical'], published_at: now.toISOString() });
  const euMatched = fromRow({ ...oatRow, id: 'eu:SR-2', source: 'eu', alert_type: 'eu-warning', categories: ['toys'], published_at: now.toISOString() });
  const all = [uk, eu, euMatched];
  const prefs = { categories: ['electrical'], allergens: [], cupboard: [] };
  assert.equal(isUkRecall(eu), false);
  assert.deepEqual(filterRecalls(all, 'all', prefs, new Set()).map((r) => r.id), ['opss:1']);
  assert.deepEqual(filterRecalls(all, 'electrical', prefs, new Set()).map((r) => r.id), ['opss:1']);
  assert.deepEqual(filterRecalls(all, 'eu', prefs, new Set()).map((r) => r.id), ['eu:SR-1', 'eu:SR-2']);
  assert.deepEqual(filterRecalls(all, 'for-you', prefs, new Set(['eu:SR-2'])).map((r) => r.id), ['opss:1', 'eu:SR-2']);
  assert.equal(recentCount(all, 7), 1);
  assert.deepEqual(badgeFor(eu), { text: 'EU warning', tone: 'warning' });
  assert.equal(badgeFor(fromRow({ ...oatRow, source: 'mhra', alert_type: 'field-safety-notice' })).text, 'Medical device notice');
  assert.equal(badgeFor(fromRow({ ...oatRow, source: 'hse', alert_type: 'safety-alert', risk_level: 'serious' })).text, 'Work safety alert');
});

// ───────── Allergens: all 14, clearer names, and ones people type themselves ─────────

import {
  ALLERGENS, allergenLabel, hasAllAllergens, toggleAllAllergens, otherAllergenKey, mentionsOtherAllergen,
  gtinValid, expandUpcE, productCodeFrom, scanConfirmer,
} from '../src/logic.js';

test('milk reads as dairy, and badges keep short names', () => {
  assert.equal(ALLERGENS.length, 14);
  assert.equal(ALLERGENS.find((a) => a.key === 'milk').label, 'Dairy (milk)');
  assert.equal(allergenLabel('milk'), 'Dairy');
  assert.equal(allergenLabel('crustaceans'), 'Crustaceans');
  assert.equal(allergenLabel('other:pea protein'), 'Pea protein');
});

test('"All 14 allergens" picks every one, keeps typed ones, and clears again', () => {
  const all = toggleAllAllergens(['eggs', 'other:kiwi']);
  assert.equal(hasAllAllergens(all), true);
  assert.ok(all.includes('other:kiwi'));
  assert.deepEqual(toggleAllAllergens(all), ['other:kiwi']);
});

test('typed allergens are tidied and matched as whole words in food recalls only', () => {
  assert.equal(otherAllergenKey('  Kiwi! '), 'other:kiwi');
  assert.equal(otherAllergenKey('a'), null);
  const kiwiRecall = { ...cookies, alertType: 'allergy', title: 'Little Bakes recalls Fruit Pots because they contain undeclared kiwis', allergens: [] };
  assert.equal(mentionsOtherAllergen(kiwiRecall, 'other:kiwi'), true);
  assert.equal(mentionsOtherAllergen({ ...kiwiRecall, title: 'Kiwifruit-flavour sweets recalled' }, 'other:kiwi'), false);
  assert.equal(mentionsOtherAllergen({ ...charger, title: 'Kiwi charger recalled' }, 'other:kiwi'), false);
  assert.equal(relevance(kiwiRecall, prefs({ allergens: ['other:kiwi'] })), 'allergen');
  assert.equal(relevance(kiwiRecall, prefs({ allergens: ['other:coconut'] })), null);
});

// ───────── Scanner: only real product codes, read steadily ─────────

test('barcodes must pass the check digit', () => {
  assert.equal(gtinValid('5000112637922'), true); // EAN-13
  assert.equal(gtinValid('5000112637923'), false);
  assert.equal(gtinValid('96385074'), true); // EAN-8
  assert.equal(gtinValid('036000291452'), true); // UPC-A
  assert.equal(gtinValid('12345'), false);
  assert.equal(expandUpcE('04252614'), '042100005264');
  assert.equal(productCodeFrom('04252614', 'upc_e'), '04252614');
  assert.equal(productCodeFrom('5000112637923', 'ean13'), null, 'a misread fails the check digit');
});

test('a code is accepted only after it reads the same for most of a second', () => {
  const confirm = scanConfirmer();
  assert.equal(confirm('5000112637922', 'ean13', 0).state, 'reading');
  assert.equal(confirm('5000112637923', 'ean13', 100).state, 'ignored');
  assert.equal(confirm('5000112637922', 'ean13', 300).state, 'reading');
  assert.equal(confirm('5000112637922', 'ean13', 600).state, 'reading', 'three reads, but too quick');
  const done = confirm('5000112637922', 'ean13', 950);
  assert.equal(done.state, 'confirmed');
  assert.equal(done.code, '5000112637922');
});
