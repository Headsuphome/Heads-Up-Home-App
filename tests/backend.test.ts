import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseFsaAlert, fetchFsaSince } from '../supabase/functions/_shared/fsa.ts';
import { normaliseOpssItem, parseOpssTitle, fetchOpssSince } from '../supabase/functions/_shared/opss.ts';
import { normaliseAllergen, categoriesForOpss } from '../supabase/functions/_shared/categories.ts';
import { cupboardConfidence, matchRecall, notificationText, tokens } from '../supabase/functions/_shared/matching.ts';
import { sendPush } from '../supabase/functions/_shared/push.ts';
import type { CupboardItem, UserProfile } from '../supabase/functions/_shared/types.ts';
import { fsaRecall, fsaAllergy, opssReport, opssBabyRecall } from './fixtures.ts';

const item = (over: Partial<CupboardItem>): CupboardItem => ({ id: 1, userId: 'u1', name: '', brand: null, barcode: null, dismissedRecalls: [], ...over });
const profile = (over: Partial<UserProfile>): UserProfile => ({ userId: 'u1', categories: [], allergens: [], alertTiming: 'instant', ...over });

// ───────── FSA ─────────

test('FSA recall becomes a clean food recall with barcode and dates', () => {
  const r = normaliseFsaAlert(fsaRecall);
  assert.equal(r.id, 'fsa:FSA-PRIN-45-2026');
  assert.equal(r.alertType, 'recall');
  assert.deepEqual(r.categories, ['food-drink']);
  assert.deepEqual(r.businesses, ['Waitrose']);
  assert.equal(r.products[0].barcode, '5000169123456');
  assert.equal(r.products[0].bestBefore, 'All dates between 14 August and 29 October 2026');
  assert.match(r.advice!, /^If you have bought the above product do not drink it/); // HTML removed
  assert.equal(r.publishedAt, '2026-09-22T00:00:00.000Z');
});

test('FSA allergy alert picks up allergens, batch codes and children category', () => {
  const r = normaliseFsaAlert(fsaAllergy);
  assert.equal(r.alertType, 'allergy');
  assert.deepEqual(r.allergens.sort(), ['eggs', 'milk']);
  assert.deepEqual(r.products[0].batchCodes, ['LB2241', 'LB2242']);
  assert.ok(r.categories.includes('baby-children'), 'kids product should be tagged for parents');
});

test('allergen labels map to the 14 UK allergens', () => {
  assert.equal(normaliseAllergen('Cereals containing gluten'), 'gluten');
  assert.equal(normaliseAllergen('Peanuts'), 'peanuts');
  assert.equal(normaliseAllergen('Almond'), 'tree-nuts');
  assert.equal(normaliseAllergen('Sulphur dioxide and sulphites'), 'sulphites');
  assert.equal(normaliseAllergen('Prawns'), 'crustaceans');
  assert.equal(normaliseAllergen('Something unknown'), null);
});

// ───────── OPSS ─────────

test('OPSS title is split into product name and reference', () => {
  assert.deepEqual(parseOpssTitle('Product Safety Report: Amdelne Tri-Proof Light (2609-0076)'), { name: 'Amdelne Tri-Proof Light', ref: '2609-0076' });
  assert.deepEqual(parseOpssTitle('Product Recall: Cosy Baby Sleep Wedge (2610-0011)'), { name: 'Cosy Baby Sleep Wedge', ref: '2610-0011' });
});

test('OPSS report becomes an electrical recall with hazard, advice and barcode', () => {
  const r = normaliseOpssItem(opssReport);
  assert.equal(r.id, 'opss:2609-0076');
  assert.equal(r.alertType, 'safety-report');
  assert.equal(r.riskLevel, 'serious');
  assert.deepEqual(r.categories, ['electrical']);
  assert.match(r.summary!, /insufficient insulation/);
  assert.match(r.advice!, /rejected at import/);
  assert.equal(r.products[0].barcode, '6971234567890');
  assert.deepEqual(r.products[0].batchCodes, ['TP-120-40W']);
  assert.equal(r.sourceUrl, 'https://www.gov.uk' + opssReport.base_path);
});

test('OPSS childcare recall lands in Baby & children', () => {
  const r = normaliseOpssItem(opssBabyRecall);
  assert.equal(r.alertType, 'recall');
  assert.deepEqual(r.categories, ['baby-children']);
  assert.match(r.advice!, /Stop using it/);
});

test('unknown OPSS categories still get a home', () => {
  assert.deepEqual(categoriesForOpss('hand-tools', 'Cordless drill'), ['trades-tools']);
  assert.deepEqual(categoriesForOpss('something-new', 'Garden hose'), ['other']);
  assert.deepEqual(categoriesForOpss('something-new', 'Baby bath seat'), ['baby-children']);
});

// ───────── Matching ─────────

test('tokens ignore filler words and join sizes', () => {
  assert.deepEqual(tokens('Little Bakes Kids Mini Cookies 6 x 20 g'), ['little', 'bake', 'kid', 'mini', 'cookie', '20g']);
  assert.deepEqual(tokens('Glass hummus'), ['glass', 'hummus']);
});

test('barcode match is the most confident', () => {
  const r = normaliseFsaAlert(fsaRecall);
  assert.equal(cupboardConfidence(item({ name: 'oat milk', barcode: '05000169123456' }), r), 'barcode');
});

test('brand + name match is likely, partial is possible, wrong brand is ignored', () => {
  const r = normaliseFsaAlert(fsaRecall);
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Waitrose' }), r), 'likely');
  assert.equal(cupboardConfidence(item({ name: 'Oat Drink Barista', brand: 'Waitrose' }), r), 'possible');
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Oatly' }), r), null);
  assert.equal(cupboardConfidence(item({ name: 'Oat Drink' }), r), 'possible');
  assert.equal(cupboardConfidence(item({ name: 'Bread' }), r), null);
});

test('"Not mine" stops the same recall matching again', () => {
  const r = normaliseFsaAlert(fsaRecall);
  assert.equal(cupboardConfidence(item({ name: 'Unsweetened Oat Drink', brand: 'Waitrose', dismissedRecalls: [r.id] }), r), null);
});

test('one alert per person, cupboard beats allergen beats category', () => {
  const r = normaliseFsaAlert(fsaAllergy);
  const matches = matchRecall(
    r,
    [
      profile({ userId: 'parent', categories: ['baby-children'] }),
      profile({ userId: 'allergic', allergens: ['milk'] }),
      profile({ userId: 'owner', allergens: ['milk'], categories: ['food-drink'] }),
      profile({ userId: 'electrician', categories: ['electrical', 'trades-tools'] }),
    ],
    [item({ id: 9, userId: 'owner', name: 'Kids Mini Cookies', brand: 'Little Bakes' })],
  );
  const byUser = Object.fromEntries(matches.map((m) => [m.userId, m]));
  assert.equal(byUser.owner.reason, 'cupboard');
  assert.equal(byUser.owner.confidence, 'likely');
  assert.equal(byUser.owner.cupboardItemId, 9);
  assert.equal(byUser.allergic.reason, 'allergen');
  assert.equal(byUser.parent.reason, 'category');
  assert.equal(byUser.electrician, undefined, 'electrician should not hear about cookies');
  assert.equal(matches.length, 3);
});

test('notification wording is calm and honest about certainty', () => {
  const r = normaliseFsaAlert(fsaRecall);
  const possible = notificationText(r, { userId: 'u', recallId: r.id, reason: 'cupboard', confidence: 'possible', cupboardItemId: 1 }, 'Oat drink');
  assert.equal(possible.title, 'Possible recall in your cupboard');
  assert.match(possible.body, /check your batch code/);
});

// ───────── Fetching (with fake servers) ─────────

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

test('fetchFsaSince lists new alerts then loads each in full, skipping withdrawn ones', async () => {
  const calls: string[] = [];
  const withdrawn = { ...fsaAllergy, notation: 'FSA-AA-51-2026', status: { label: 'Withdrawn' } };
  const fetchFn = fakeFetch({
    '/FSA-PRIN-45-2026': { items: fsaRecall },
    '/FSA-AA-50-2026': { items: [fsaAllergy] },
    '/FSA-AA-51-2026': { items: withdrawn },
    'food-alerts/id?since=': { items: [{ notation: 'FSA-PRIN-45-2026' }, { notation: 'FSA-AA-50-2026' }, { notation: 'FSA-AA-51-2026' }] },
  }, calls);
  const recalls = await fetchFsaSince(fetchFn, '2026-09-01T00:00:00Z');
  assert.deepEqual(recalls.map((r) => r.id).sort(), ['fsa:FSA-AA-50-2026', 'fsa:FSA-PRIN-45-2026']);
  assert.ok(calls[0].includes('since=2026-09-01T00%3A00%3A00Z'));
  assert.ok(calls.slice(1).every((u) => !u.includes('_view')), 'single-alert URLs must not ask for a view the FSA rejects');
});

test('one FSA alert failing does not lose the others', async () => {
  const fetchFn = async (url: string) => {
    if (url.includes('?since=')) {
      return new Response(JSON.stringify({ items: [
        { notation: 'FSA-PRIN-45-2026' },
        { notation: 'FSA-AA-45-2026', title: 'Shop recalls biscuits because they contain milk', created: '2026-10-10', status: { label: 'Published' } },
      ] }));
    }
    if (url.endsWith('/FSA-AA-45-2026')) return new Response('bad', { status: 400 });
    return new Response(JSON.stringify({ items: [fsaRecall] }));
  };
  const recalls = await fetchFsaSince(fetchFn, '2026-09-01T00:00:00Z');
  assert.deepEqual(recalls.map((r) => r.id).sort(), ['fsa:FSA-AA-45-2026', 'fsa:FSA-PRIN-45-2026']);
  assert.equal(recalls.find((r) => r.id === 'fsa:FSA-AA-45-2026')!.title, 'Shop recalls biscuits because they contain milk');
});

test('fetchOpssSince searches GOV.UK then reads each notice', async () => {
  const fetchFn = fakeFetch({
    '/api/search.json': { results: [
      { link: opssReport.base_path, public_timestamp: '2026-09-21T14:21:52Z' },
      { link: opssBabyRecall.base_path, public_timestamp: '2026-10-02T09:00:00Z' },
      { link: '/old-one', public_timestamp: '2026-01-01T00:00:00Z' },
    ] },
    [`/api/content${opssReport.base_path}`]: opssReport,
    [`/api/content${opssBabyRecall.base_path}`]: opssBabyRecall,
  });
  const recalls = await fetchOpssSince(fetchFn, '2026-09-01T00:00:00Z');
  assert.deepEqual(recalls.map((r) => r.id), ['opss:2609-0076', 'opss:2610-0011']);
});

test('sendPush batches messages and reports uninstalled devices', async () => {
  const fetchFn = async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init!.body));
    return new Response(JSON.stringify({ data: sent.map((m: { to: string }) =>
      m.to === 'dead' ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }) }));
  };
  const messages = Array.from({ length: 150 }, (_, i) => ({ to: i === 7 ? 'dead' : `tok${i}`, title: 't', body: 'b' }));
  const result = await sendPush(fetchFn, messages);
  assert.equal(result.sent, 149);
  assert.deepEqual(result.deadTokens, ['dead']);
});

test('sendPush splits a batch that mixes apps, as Expo asks', async () => {
  const calls: string[][] = [];
  const fetchFn = async (_url: string, init?: RequestInit) => {
    const sent: { to: string }[] = JSON.parse(String(init!.body));
    calls.push(sent.map((m) => m.to));
    if (sent.some((m) => m.to === 'snack1') && sent.some((m) => m.to !== 'snack1')) {
      return new Response(JSON.stringify({ errors: [{
        code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', type: 'USER', isTransient: false,
        details: { '@exponent/snack': ['snack1'], '@headsuphome-uk/heads-up-home': ['app1', 'app2'] },
      }] }), { status: 400 });
    }
    return new Response(JSON.stringify({ data: sent.map(() => ({ status: 'ok' })) }));
  };
  const messages = ['app1', 'snack1', 'app2'].map((to) => ({ to, title: 't', body: 'b' }));
  const result = await sendPush(fetchFn, messages);
  assert.equal(result.sent, 3);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(calls, [['app1', 'snack1', 'app2'], ['app1', 'app2'], ['snack1']]);
});

test('a failed push batch is reported without stopping the others', async () => {
  let n = 0;
  const fetchFn = async (_url: string, init?: RequestInit) => {
    n++;
    const sent: unknown[] = JSON.parse(String(init!.body));
    if (n === 1) return new Response('Service unavailable', { status: 503 });
    return new Response(JSON.stringify({ data: sent.map(() => ({ status: 'ok' })) }));
  };
  const messages = Array.from({ length: 120 }, (_, i) => ({ to: `tok${i}`, title: 't', body: 'b' }));
  const result = await sendPush(fetchFn, messages);
  assert.equal(result.sent, 20);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /503/);
});

// ───────── Photos ─────────

import { readFileSync } from 'node:fs';
import { jpegsInPdf, bestPhoto, imagePath } from '../supabase/functions/_shared/images.ts';
import { mediaOf } from '../supabase/functions/_shared/opss.ts';
import { fsaMedia } from '../supabase/functions/_shared/fsa.ts';

test('the product photo is lifted out of a notice PDF, skipping logos and CMYK images', () => {
  const pdf = new Uint8Array(readFileSync(new URL('./fixtures/notice.pdf', import.meta.url)));
  const expected = new Uint8Array(readFileSync(new URL('./fixtures/photo.jpg', import.meta.url)));
  const all = jpegsInPdf(pdf);
  assert.equal(all.length, 1, 'tiny logo and CMYK image are skipped');
  const best = bestPhoto(pdf)!;
  assert.equal(best.width, 640);
  assert.equal(best.height, 480);
  assert.deepEqual(best.jpeg, expected, 'extracted bytes are exactly the original JPEG');
});

test('a PDF without photos gives no photo', () => {
  assert.equal(bestPhoto(new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Length 3 >>\nstream\nabc\nendstream endobj')), null);
});

test('notice PDFs and direct images are found for both agencies', () => {
  const opss = mediaOf([
    { content_type: 'application/pdf', url: 'https://assets.publishing.service.gov.uk/media/abc/light.pdf' },
  ], '');
  assert.deepEqual(opss, { documentUrl: 'https://assets.publishing.service.gov.uk/media/abc/light.pdf', imageUrl: null });
  const withImage = mediaOf([{ content_type: 'image/jpeg', url: 'https://assets.publishing.service.gov.uk/media/x/photo.jpg' }], '');
  assert.equal(withImage.imageUrl, 'https://assets.publishing.service.gov.uk/media/x/photo.jpg');

  assert.deepEqual(fsaMedia([{ '@id': 'https://s3-eu-west-1.amazonaws.com/fsa-alerts-files/production/X/Customer-notice.pdf', title: 'Customer notice' }]), {
    documentUrl: 'https://s3-eu-west-1.amazonaws.com/fsa-alerts-files/production/X/Customer-notice.pdf', imageUrl: null,
  });
  assert.deepEqual(fsaMedia(undefined), { documentUrl: null, imageUrl: null });
});

test('photo file names are safe', () => {
  assert.equal(imagePath('fsa:FSA-PRIN-45-2026'), 'fsa_FSA-PRIN-45-2026.jpg');
  assert.equal(imagePath('opss:2609-0076'), 'opss_2609-0076.jpg');
});

// ───────── Medicines (MHRA) and Scotland (FSS) ─────────

import { parseMhraTitle, riskForClass, batchesFrom, normaliseMhraItem, fetchMhraSince } from '../supabase/functions/_shared/mhra.ts';
import { parseFssListing, parseFssTitle, normaliseFss } from '../supabase/functions/_shared/fss.ts';
import { allergensIn } from '../supabase/functions/_shared/categories.ts';

const mhraRecall = {
  base_path: '/drug-device-alerts/class-3-medicines-recall-norgine-limited-movicol-plain-13-dot-7g-powder-for-oral-solution-el-26-a-slash-41',
  title: 'Class 3 Medicines Recall: Norgine Limited, MOVICOL Plain 13.7g powder for oral solution, EL(26)A/41',
  description: 'Norgine Limited is recalling specific batches because some sachets may be under-filled.',
  first_published_at: '2026-10-05T11:00:00+01:00',
  public_updated_at: '2026-10-05T11:00:00+01:00',
  details: {
    metadata: { alert_type: 'medicines-recall-notification', issued_date: '2026-10-05', medical_specialism: ['pharmacy'] },
    attachments: [{ content_type: 'application/pdf', url: 'https://assets.publishing.service.gov.uk/media/x/EL26A41.pdf' }],
    body: '<h2>Medicine Details</h2><p>MOVICOL Plain</p>' +
      '<h2>Affected Lot Batch Numbers</h2><table><tr><th>Batch No.</th><th>Expiry Date</th><th>Pack Size</th></tr>' +
      '<tr><td>458273</td><td>12/2026</td><td>30</td></tr><tr><td>475287</td><td>12/2026</td><td>30</td></tr></table>' +
      '<h2>Advice for Healthcare Professionals:</h2><p>Stop supplying.</p>' +
      '<h2>Advice for Patients:</h2><p>Patients do not need to take any action. Speak to your pharmacist if you have questions.</p>',
  },
};

test('MHRA recall titles are split into company, product and reference', () => {
  assert.deepEqual(parseMhraTitle(mhraRecall.title), { company: 'Norgine Limited', product: 'MOVICOL Plain 13.7g powder for oral solution', ref: 'EL(26)A/41' });
  assert.deepEqual(parseMhraTitle('Nova Biomedical StatStrip ketone test strips: risk of disruption to blood ketone testing (DSI/2026/013)'),
    { company: null, product: 'Nova Biomedical StatStrip ketone test strips', ref: 'DSI/2026/013' });
  assert.equal(riskForClass('Class 1 Medicines Recall: X'), 'serious');
  assert.equal(riskForClass('Class 4 Medicines Defect Information: X'), 'low');
});

test('MHRA batch table and patient advice are read', () => {
  assert.deepEqual(batchesFrom(mhraRecall.details.body), { batchCodes: ['458273', '475287'], expiry: '12/2026' });
  const r = normaliseMhraItem(mhraRecall);
  assert.equal(r.id, 'mhra:EL26A41');
  assert.equal(r.source, 'mhra');
  assert.equal(r.title, 'MOVICOL Plain 13.7g powder for oral solution');
  assert.equal(r.riskLevel, 'medium');
  assert.deepEqual(r.categories, ['medicines']);
  assert.deepEqual(r.businesses, ['Norgine Limited']);
  assert.match(r.advice!, /Patients do not need to take any action/);
  assert.equal(r.products[0].bestBefore, 'Expiry: 12/2026');
  assert.equal(r.documentUrl, 'https://assets.publishing.service.gov.uk/media/x/EL26A41.pdf');
});

test('only medicine recalls and device safety information are collected', async () => {
  const seen: string[] = [];
  const fetchFn = async (url: string) => {
    seen.push(url);
    if (url.includes('filter_alert_type=medicines-recall-notification')) {
      return new Response(JSON.stringify({ results: [{ link: mhraRecall.base_path, public_timestamp: '2026-10-05T10:00:00Z' }] }));
    }
    if (url.includes('filter_alert_type=device-safety-information')) {
      return new Response(JSON.stringify({ results: [{ link: '/drug-device-alerts/fsn-roundup', public_timestamp: '2026-10-06T10:00:00Z' }] }));
    }
    if (url.includes('fsn-roundup')) {
      return new Response(JSON.stringify({ ...mhraRecall, base_path: '/drug-device-alerts/fsn-roundup', details: { ...mhraRecall.details, metadata: { alert_type: 'field-safety-notices' } } }));
    }
    return new Response(JSON.stringify(mhraRecall));
  };
  const recalls = await fetchMhraSince(fetchFn, '2026-10-01T00:00:00Z');
  assert.deepEqual(recalls.map((r) => r.id), ['mhra:EL26A41']);
  assert.ok(seen.some((u) => u.includes('filter_format=medical_safety_alert')));
});

const fssListingHtml = `
  <ul>
    <li><a href="https://alerts.food.gov.uk/news-alerts/alert/fsa-aa-45-2026">Halo Foods recalls Skinny Crunch Bars because of undeclared peanuts</a><span>13 October 2026</span></li>
    <li><span class="date">1 October 2026</span>
      <a class="card" href="/alerts/allergy-alert-dunnet-bay-distillers-recalls-rock-rose-gin-summer-cup-liqueur-because-of-undeclared-sulphites">
        Dunnet Bay Distillers recalls Rock Rose Gin Summer Cup Liqueur because of undeclared sulphites</a></li>
    <li><a href="/alerts/food-alert-highland-dairy-recalls-raw-milk-cheese-because-of-listeria">Highland Dairy recalls Raw Milk Cheese because of the possible presence of Listeria</a> 22 September 2026</li>
    <li><a href="/alerts">All alerts</a></li>
  </ul>`;

test('only Scotland-only alerts are taken from the FSS page', () => {
  const items = parseFssListing(fssListingHtml);
  assert.deepEqual(items.map((i) => i.slug), [
    'allergy-alert-dunnet-bay-distillers-recalls-rock-rose-gin-summer-cup-liqueur-because-of-undeclared-sulphites',
    'food-alert-highland-dairy-recalls-raw-milk-cheese-because-of-listeria',
  ]);
  assert.equal(items[0].date, '2026-10-01T12:00:00.000Z');
  assert.equal(items[0].url.startsWith('https://www.foodstandards.gov.scot/alerts/'), true);
});

test('FSS alerts become recalls with business, product and allergens', () => {
  assert.deepEqual(parseFssTitle('Dunnet Bay Distillers recalls Rock Rose Gin Summer Cup Liqueur because of undeclared sulphites'),
    { business: 'Dunnet Bay Distillers', product: 'Rock Rose Gin Summer Cup Liqueur', reason: 'because of undeclared sulphites' });
  assert.deepEqual(allergensIn('recalls Peanut Butter Bars because of undeclared milk, egg and mustard').sort(), ['eggs', 'milk', 'mustard']);
  assert.deepEqual(allergensIn('Peanut Butter Bars recalled because of Listeria'), []);

  const [allergy, food] = parseFssListing(fssListingHtml);
  const page = '<html><head><meta name="description" content="Contains sulphites not mentioned on the label."></head>' +
    '<body><h2>What to do</h2><p>If you are sensitive to sulphites, do not drink it. Return it for a refund.</p></body></html>';
  const a = normaliseFss(allergy, page);
  assert.equal(a.id.startsWith('fss:allergy-alert-dunnet'), true);
  assert.equal(a.alertType, 'allergy');
  assert.deepEqual(a.allergens, ['sulphites']);
  assert.deepEqual(a.businesses, ['Dunnet Bay Distillers']);
  assert.equal(a.summary, 'Contains sulphites not mentioned on the label.');
  assert.match(a.advice!, /do not drink it/);

  const f = normaliseFss(food, null);
  assert.equal(f.alertType, 'recall');
  assert.equal(f.summary, 'Recalled because of the possible presence of Listeria.');
  assert.equal(f.publishedAt, '2026-09-22T12:00:00.000Z');
});

// ───────── Pets ─────────

import { categoriesForFsa, isPetFood, isPetProduct } from '../supabase/functions/_shared/categories.ts';
import { fetchVmdSince, normaliseVmdItem, vmdProductName } from '../supabase/functions/_shared/vmd.ts';

test('pet food recalls are filed under Pets, not food for people', () => {
  assert.deepEqual(categoriesForFsa('Rhondda Raw recalls Beef 80/10/10 Raw Frozen Dog Food because of contamination with Salmonella'), ['pets']);
  assert.deepEqual(categoriesForFsa('Fold Hill Foods recall several cat food products because of safety concerns'), ['pets']);
  assert.deepEqual(categoriesForFsa("Sainsbury's recalls a range of its pet food pouch selections due to high levels of Vitamin D"), ['pets']);
  assert.deepEqual(categoriesForFsa('Asda recalls Extra Special Hot Dog Sausages because of undeclared mustard'), ['food-drink']);
  assert.equal(isPetFood('Kids Mini Cookies'), false);
});

test('pet products are told apart from children\'s toys shaped like animals', () => {
  assert.deepEqual(categoriesForOpss('toys', 'KTL 2pc Balloon Dog Toy'), ['toys']);
  assert.deepEqual(categoriesForOpss('toys', 'Plush dog toy for children'), ['toys', 'baby-children']);
  assert.deepEqual(categoriesForOpss('toys', 'Squeaky chew toys for dogs'), ['pets']);
  assert.deepEqual(categoriesForOpss('electrical-appliances-and-equipment', 'Heated pet mat'), ['electrical', 'pets']);
  assert.deepEqual(categoriesForOpss(null, 'Retractable dog lead'), ['pets']);
  assert.equal(isPetProduct('Dog lead'), true);
  assert.equal(isPetProduct('Sausage dog cushion'), false);
});

const vmdContent = {
  title: 'Product defect recall alert: Clavudale 40 mg/10 mg tablets for cats and dogs',
  base_path: '/government/news/product-defect-recall-alert-clavudale-40-mg10-mg-tablets-for-cats-and-dogs',
  description: 'Dechra is recalling specific batches of Clavudale tablets because some may not dissolve properly.',
  first_published_at: '2026-10-20T09:00:00Z',
  public_updated_at: '2026-10-20T09:00:00Z',
  details: { body: '<p>Dechra is recalling specific batches.</p><p>Batch numbers: A1234, B5678</p><p>Expiry: 03/2027</p><h2>Action</h2><p>Speak to your vet if your pet is taking this medicine.</p>' },
};

test('VMD recall notices become pet medicine recalls', () => {
  assert.equal(vmdProductName('Ronidazole Capsules - Product defect recall alert'), 'Ronidazole Capsules');
  assert.equal(vmdProductName('[Withdrawn] Product defect recall alert for Purevax RCP and Eurican Herpes products'), 'Purevax RCP and Eurican Herpes products');
  const r = normaliseVmdItem(vmdContent);
  assert.equal(r.source, 'vmd');
  assert.equal(r.title, 'Clavudale 40 mg/10 mg tablets for cats and dogs');
  assert.deepEqual(r.categories, ['pets']);
  assert.deepEqual(r.products[0].batchCodes, ['A1234', 'B5678']);
  assert.equal(r.products[0].bestBefore, 'Expiry: 03/2027');
  assert.match(r.advice ?? '', /speak to your vet/i);
  assert.equal(r.sourceUrl, 'https://www.gov.uk' + vmdContent.base_path);
});

test('VMD notices written as labels and values: product, batch, reason and action', () => {
  assert.equal(vmdProductName('Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens - Product recall alert'),
    'Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens');
  const lines = normaliseVmdItem({
    ...vmdContent,
    title: 'Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens - Product recall alert',
    description: 'Product defect recall alert for Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens by Pets Choice Limited.',
    details: { body: '<p>Pets Choice has initiated a recall.</p><p>Product: Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens<br>Product code: B0275<br>Bulk Batch Number: 5E10<br>Packing Run Number: 52609<br>MA Number: Vm52979/4019</p><h2>Nature of the defect</h2><p>Leaking seals were found on several units during a routine stability programme.</p><h2>Action for retailers</h2><p>Check stock for batch 5E10 and return affected product.</p><p>Level of recall: Retailer</p>' },
  });
  assert.equal(lines.title, 'Bob Martin Clear Wormer 20 mg Spot-on Solution for Cats and Kittens');
  assert.deepEqual(lines.products[0].batchCodes, ['5E10']);
  assert.match(lines.summary ?? '', /leaking seals/i);
  assert.match(lines.advice ?? '', /check stock for batch 5E10/i);
  assert.match(lines.products[0].batchNotes ?? '', /Packing run number: 52609/);
  assert.match(lines.products[0].batchNotes ?? '', /MA number: Vm52979\/4019/);

  const table = normaliseVmdItem({
    ...vmdContent,
    description: 'Product defect recall alert for Clavudale by Dechra.',
    details: { body: '<table><tbody><tr><td>Product</td><td>Clavudale 40 mg/10 mg tablets</td></tr><tr><td>Batch number</td><td>A1234, B5678</td></tr><tr><td>Expiry date</td><td>03/2027</td></tr><tr><td>Reason for recall</td><td>Tablets may not dissolve properly.</td></tr></tbody></table>' },
  });
  assert.deepEqual(table.products[0].batchCodes, ['A1234', 'B5678']);
  assert.equal(table.products[0].bestBefore, 'Expiry: 03/2027');
  assert.equal(table.products[0].name, 'Clavudale 40 mg/10 mg tablets');
  assert.match(table.summary ?? '', /may not dissolve/);
});

test('VMD letter-style notices: titles, batch tables, lists, reasons and actions', () => {
  assert.equal(vmdProductName('Batch recall - Kelactin and PGF Veyx Forte'), 'Kelactin and PGF Veyx Forte');
  assert.equal(vmdProductName('Batch recall alert for Vey Tosal 100 mg/ml + 0.05 mg/ml Solution for Injection'), 'Vey Tosal 100 mg/ml + 0.05 mg/ml Solution for Injection');
  assert.equal(vmdProductName('Batch recall Anesketin 100 mg/ml Solution for Injection for Dogs, Cats and Horses'), 'Anesketin 100 mg/ml Solution for Injection for Dogs, Cats and Horses');
  assert.equal(vmdProductName('Scabigard Suspension for Cutaneous Administration - product defect recall alert'), 'Scabigard Suspension for Cutaneous Administration');
  assert.equal(vmdProductName('Anesketin 100 mg/ml Solution for Injection for dogs, cats and horses recall alert'), 'Anesketin 100 mg/ml Solution for Injection for dogs, cats and horses');

  const base = { ...vmdContent, description: 'Batch recall alert for a veterinary medicine.' };
  // A batch table with a Product column becomes one product per name.
  const kelactin = normaliseVmdItem({ ...base, title: 'Batch recall - Kelactin and PGF Veyx Forte', details: { body:
    '<p>We wish to inform wholesalers that Veyx-Pharma GmbH has initiated a Class II recall to wholesaler level due to an increased risk of microbial contamination at a contract manufacturer.</p>' +
    '<table><thead><tr><th>Product</th><th>Batch number</th><th>Expiry date</th></tr></thead><tbody>' +
    '<tr><td>Kelactin 50 Microgram/ml Oral Solution</td><td>24E027</td><td>05/2026</td></tr>' +
    '<tr><td>Kelactin 50 Microgram/ml Oral Solution</td><td>24I071</td><td>09/2026</td></tr>' +
    '<tr><td>PGF Veyx Forte 0.250mg/ml Solution for Injection</td><td>24E015</td><td>05/2028</td></tr></tbody></table>' +
    '<p>Wholesalers should examine inventory immediately and quarantine affected products.</p>' } });
  assert.equal(kelactin.products.length, 2);
  assert.deepEqual(kelactin.products[0].batchCodes, ['24E027', '24I071']);
  assert.equal(kelactin.products[0].bestBefore, 'Expiry: 05/2026, 09/2026');
  assert.deepEqual(kelactin.products[1].batchCodes, ['24E015']);
  assert.match(kelactin.summary ?? '', /^An increased risk of microbial contamination/);
  assert.match(kelactin.advice ?? '', /examine inventory immediately/);
  assert.match(kelactin.advice ?? '', /wholesaler level/);

  // A batch table without a Product column; the reason follows "as".
  const scabigard = normaliseVmdItem({ ...base, title: 'Scabigard Suspension for Cutaneous Administration - product defect recall alert', details: { body:
    '<p>We wish to inform wholesalers, veterinarians and end users that Zoetis has initiated a Class II recall of Scabigard as the affected batches may not show the expected take after use.</p>' +
    '<table><tr><th>Batch number</th><th>Date of manufacture</th><th>Expiry date</th></tr><tr><td>7482095A01</td><td>June 2024</td><td>May 2026</td></tr><tr><td>748209701</td><td>January 2025</td><td>December 2026</td></tr></table>' +
    '<p>End users should return affected product to the veterinary practice where they bought it.</p>' } });
  assert.equal(scabigard.products.length, 1);
  assert.deepEqual(scabigard.products[0].batchCodes, ['7482095A01', '748209701']);
  assert.match(scabigard.summary ?? '', /^The affected batches may not show/);
  assert.match(scabigard.advice ?? '', /return affected product/);

  // Batches as a list after an introduction that mentions batches.
  const anesketin = normaliseVmdItem({ ...base, title: 'Batch recall Anesketin 100 mg/ml Solution for Injection for Dogs, Cats and Horses', details: { body:
    '<p>We wish to inform veterinarians that Dechra has initiated a Class II recall to veterinarian level due to visible particles present in the vials.</p>' +
    '<p>Only 10 ml vials from the following batches are affected:</p><ul><li>146534, expiring 28 February 2026</li><li>155130, expiring 28 February 2027</li></ul>' +
    '<p>Veterinarians should check their inventory immediately and quarantine affected products.</p>' } });
  assert.deepEqual(anesketin.products[0].batchCodes, ['146534', '155130']);
  assert.equal(anesketin.products[0].bestBefore, 'Expiry: 28 February 2026, 28 February 2027');
  assert.equal(anesketin.summary, 'Visible particles present in the vials.');
  assert.match(anesketin.advice ?? '', /veterinarian level/);

  // A batch written in a sentence.
  const veyTosal = normaliseVmdItem({ ...base, title: 'Batch recall alert for Vey Tosal 100 mg/ml + 0.05 mg/ml Solution for Injection', details: { body:
    '<p>We wish to inform veterinarians that Veyx-Pharma GmbH has initiated a Class II recall to veterinarian level, effective immediately, because of particles observed in batch 23K019, with an expiry date of 11/2026.</p><p>Manufactured in 2024.</p>' } });
  assert.deepEqual(veyTosal.products[0].batchCodes, ['23K019']);
  assert.equal(veyTosal.products[0].bestBefore, 'Expiry: 11/2026');
  assert.match(veyTosal.summary ?? '', /^Particles observed in batch 23K019/);

  // With no reason given, the opening line is used without "We wish to inform ... that".
  const plain = normaliseVmdItem({ ...base, details: { body: '<p>We wish to inform retailers that Pets Choice Limited has initiated a Class II recall.</p>' } });
  assert.equal(plain.summary, 'Pets Choice Limited has initiated a Class II recall.');
});

test('VMD notices: products named once in a table, and reasons worded in other ways', () => {
  const base = { ...vmdContent, description: 'Batch recall alert for a veterinary medicine.' };
  // Product cell merged across rows (later rows have fewer cells) or left blank.
  const merged = normaliseVmdItem({ ...base, title: 'Batch recall - Kelactin and PGF Veyx Forte', details: { body:
    '<p>We wish to inform wholesalers that Veyx-Pharma GmbH has initiated a Class II recall to wholesaler level.</p>' +
    '<table><tr><th>Product</th><th>Batch number</th><th>Expiry date</th></tr>' +
    '<tr><td rowspan="3">Kelactin 50 Microgram/ml Oral Solution</td><td>24E027</td><td>05/2026</td></tr>' +
    '<tr><td>24I071</td><td>09/2026</td></tr><tr><td>24L044</td><td>12/2026</td></tr>' +
    '<tr><td>PGF Veyx Forte 0.250mg/ml Solution for Injection</td><td>24E015</td><td>05/2028</td></tr>' +
    '<tr><td></td><td>24G232</td><td>07/2028</td></tr></table>' } });
  assert.deepEqual(merged.products.map((p) => p.name), ['Kelactin 50 Microgram/ml Oral Solution', 'PGF Veyx Forte 0.250mg/ml Solution for Injection']);
  assert.deepEqual(merged.products[0].batchCodes, ['24E027', '24I071', '24L044']);
  assert.deepEqual(merged.products[1].batchCodes, ['24E015', '24G232']);

  const following = normaliseVmdItem({ ...base, details: { body:
    '<p>We wish to inform veterinarians that Dechra Pharmaceuticals PLC have initiated a Class II recall to veterinarian level following the observation of visible particles present in the vials.</p>' } });
  assert.equal(following.summary, 'Visible particles present in the vials.');

  const separate = normaliseVmdItem({ ...base, details: { body:
    '<p>We wish to inform wholesalers, veterinarians and end users that Zoetis has initiated a Class II recall for Scabigard Suspension for Cutaneous Administration.</p>' +
    '<p>It has been identified that the affected batches may not demonstrate the expected signs of take following administration.</p>' +
    '<p>For queries please contact Zoetis on 0345 300 8034.</p>' } });
  assert.equal(separate.summary, 'The affected batches may not demonstrate the expected signs of take following administration.');

  const precaution = normaliseVmdItem({ ...base, details: { body:
    '<p>We wish to inform veterinarians that X Ltd has initiated a recall as a precautionary measure.</p><p>Some vials were found to be cracked.</p>' } });
  assert.equal(precaution.summary, 'Some vials were found to be cracked.');
  const relates = normaliseVmdItem({ ...base, details: { body: '<p>We wish to inform veterinarians that Dechra has initiated a Class II recall.</p><p>The reason for the recall relates to the identification of visible particles present in the vials.</p>' } });
  assert.equal(relates.summary, 'Visible particles present in the vials.');
});

test('the VMD collector skips other news and withdrawn alerts', async () => {
  const fetchFn = async (url: string) => {
    if (url.includes('/api/search.json')) {
      assert.match(url, /filter_organisations=veterinary-medicines-directorate/);
      return new Response(JSON.stringify({ results: [
        { link: '/government/news/a', title: 'Product defect recall alert: A', public_timestamp: '2026-10-20T09:00:00Z' },
        { link: '/government/news/b', title: 'VMD annual report published', public_timestamp: '2026-10-21T09:00:00Z' },
        { link: '/government/news/c', title: 'Product defect recall alert: C', public_timestamp: '2026-10-22T09:00:00Z' },
      ] }));
    }
    const path = url.split('/api/content')[1];
    const withdrawn = path.endsWith('/c') ? { withdrawn_notice: { explanation: 'Recall complete' } } : {};
    return new Response(JSON.stringify({ ...vmdContent, ...withdrawn, base_path: path, title: path.endsWith('/a') ? 'Product defect recall alert: A' : 'Product defect recall alert: C' }));
  };
  const recalls = await fetchVmdSince(fetchFn, '2026-10-01T00:00:00Z');
  assert.deepEqual(recalls.map((r) => r.id), ['vmd:a']);
});

// ───────────── More sources: MHRA Field Safety Notices, HSE, EU Safety Gate, and history loading ─────────────
import { parseFsnList, isHomeDevice, homeFsnsFrom } from '../supabase/functions/_shared/mhra-fsn.ts';
import { parseHseList, isRelevantHse, normaliseHse } from '../supabase/functions/_shared/hse.ts';
import { parseEuReportList, parseEuReport, euMeasures } from '../supabase/functions/_shared/eu.ts';
import { runBackfill, BACKFILL_STEPS, type BackfillState } from '../supabase/functions/_shared/backfill.ts';
import { matchRecall as matchRecallForSources, notificationText as notificationTextForSources } from '../supabase/functions/_shared/matching.ts';

const fsnBody = '<h2 id="overview">Overview</h2><p>If you receive a field safety notice (FSN) from a manufacturer you must always act on it.</p>' +
  '<h3 id="abbott-freestyle-libre-3-app">Abbott: FreeStyle Libre 3 App</h3><p>14 October 2026</p><p>Continuous glucose monitoring app</p>' +
  '<p>MHRA reference: <a rel="external" href="https://mhra-gov.filecamp.com/s/d/abc">40512345</a> 2026/010/014/601/001</p>' +
  '<h3 id="philips-zenition">Philips Medical Systems Nederland BV: Philips Zenition 50</h3><p>29 September 2026</p><p>Interventional Fluoroscopic X-Ray System</p>' +
  '<p>MHRA reference: <a rel="external" href="https://mhra-gov.filecamp.com/s/d/def">37220338</a></p>' +
  '<h3 id="tandem">Tandem Diabetes Care: t:slim X2 Insulin Pump</h3><p>September 2026</p><p>Ambulatory insulin infusion pump</p>' +
  '<p>MHRA reference: <a rel="external" href="https://mhra-gov.filecamp.com/s/d/jkl">40411111</a></p>' +
  '<h3 id="b-braun-space">B Braun: Space Infusion Pumps</h3><p>October 2026</p><p>Bedside syringe pump/infusion pump, single-channel</p>' +
  '<p>MHRA reference: <a rel="external" href="https://mhra-gov.filecamp.com/s/d/ghi">40400000</a></p>';

test('MHRA Field Safety Notices keep only devices people use at home', () => {
  const all = parseFsnList(fsnBody);
  assert.equal(all.length, 4);
  assert.deepEqual(all.map(isHomeDevice), [true, false, true, false]);
  assert.equal(all[2].device, 't:slim X2 Insulin Pump');
  assert.equal(all[2].manufacturer, 'Tandem Diabetes Care');
  const recalls = homeFsnsFrom({ base_path: '/drug-device-alerts/field-safety-notices-12-to-16-october-2026', first_published_at: '2026-10-19T10:00:00Z', details: { body: fsnBody } });
  assert.equal(recalls.length, 2);
  const r = recalls[0];
  assert.equal(r.id, 'mhra-fsn:40512345');
  assert.equal(r.source, 'mhra');
  assert.equal(r.alertType, 'field-safety-notice');
  assert.equal(r.title, 'FreeStyle Libre 3 App (Abbott)');
  assert.equal(r.documentUrl, 'https://mhra-gov.filecamp.com/s/d/abc');
  assert.equal(r.sourceUrl, 'https://www.gov.uk/drug-device-alerts/field-safety-notices-12-to-16-october-2026#abbott-freestyle-libre-3-app');
  assert.deepEqual(r.categories, ['medicines']);
  assert.equal(r.publishedAt.slice(0, 10), '2026-10-14');
});

const hseList = '<table class="hse-table" id="safetyalerts"><thead><tr><th>Date</th><th>Topic</th><th>Bulletin No</th><th>Industry</th></tr></thead><tbody>' +
  '<tr><td>09/2026</td><td><a href="offshore-elevated-cabin-floor-windows.htm">Offshore - Elevated cabin floor windows</a></td><td>ED03-2026</td><td>Offshore installation duty holders</td></tr>' +
  '<tr><td>08/2023</td><td><a href="bendpak-vehicle-lifts2.htm">Unsafe bolts on BendPak XPR series two-post vehicle lift</a></td><td>FOD02-2023</td><td>Vehicle repair garages</td></tr></tbody></table>';
const hsePage = '<div id="page-contents"><h1>Health and Safety Executive - Safety alert</h1><p>Issue date: 08/23</p><h2>Issue</h2><p>Some lifts use bolts that are not strong enough.</p>' +
  '<h2>Action required:</h2><h3>Users of BendPak two-post lifts should:</h3><h4>Check</h4><p>Check the bolts.</p><h2>Guidance</h2><p>More reading.</p></div>';

test('HSE alerts: specialist industries are left out, the rest become Trades & tools alerts', () => {
  const rows = parseHseList(hseList);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(isRelevantHse), [false, true]);
  assert.equal(rows[1].url, 'https://www.hse.gov.uk/safetybulletins/bendpak-vehicle-lifts2.htm');
  const r = normaliseHse(rows[1], hsePage);
  assert.equal(r.id, 'hse:FOD02-2023');
  assert.equal(r.source, 'hse');
  assert.deepEqual(r.categories, ['trades-tools']);
  assert.equal(r.riskLevel, 'serious');
  assert.match(r.summary ?? '', /^Safety alert: Some lifts use bolts/);
  assert.match(r.advice ?? '', /Users of BendPak two-post lifts should:\nCheck\nCheck the bolts\./);
  assert.doesNotMatch(r.advice ?? '', /More reading/);
  assert.equal(r.publishedAt.slice(0, 7), '2023-08');
});

const euList = '<Safety-Gate><weeklyReport><reference>Report-2026-43</reference><year>2026</year><month>10</month><day>30</day><URL>https://ec.europa.eu/r/43?language=en&amp;x=1</URL></weeklyReport>' +
  '<weeklyReport><reference>Report-2026-42</reference><year>2026</year><month>10</month><day>23</day><URL>https://ec.europa.eu/r/42</URL></weeklyReport></Safety-Gate>';
const euNotification = (n: string, category: string, extra = '') => `<notifications><caseNumber>SR/0${n}/26</caseNumber>` +
  `<reference><![CDATA[https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/${n}]]></reference><category><![CDATA[${category}]]></category>` +
  '<product><![CDATA[Projector lamp]]></product><brand><![CDATA[Hema]]></brand><name><![CDATA[Night light]]></name><type_numberOfModel><![CDATA[39.62]]></type_numberOfModel>' +
  '<batchNumber><![CDATA[]]></batchNumber><barcode><![CDATA[8720354642689]]></barcode><riskType><![CDATA[Chemical]]></riskType><danger><![CDATA[Too much lead.]]></danger>' +
  '<measures><![CDATA[Type of economic operator taking notified measure(s): OtherCategory of measure(s): Recall of the product from end usersDate of entry into force: 22/05/2026]]></measures>' +
  `<notifyingCountry>Luxembourg</notifyingCountry><type>Consumer</type><level>Serious risk</level><pictures><picture><![CDATA[https://ec.europa.eu/img/1]]></picture></pictures>${extra}</notifications>`;

test('EU Safety Gate weekly reports become clearly labelled EU warnings', () => {
  const reports = parseEuReportList(euList);
  assert.deepEqual(reports.map((r) => r.date), ['2026-10-23', '2026-10-30']);
  assert.equal(reports[1].url, 'https://ec.europa.eu/r/43?language=en&x=1');
  assert.deepEqual(euMeasures('Type of economic operator: OtherCategory of measure(s): Recall of the product from end usersDate of entry into force: 22/05/2026'), ['Recall of the product from end users']);
  const recalls = parseEuReport(`<Safety-Gate>${euNotification('3024', 'Electrical appliances and equipment')}${euNotification('3099', 'Motor vehicles')}</Safety-Gate>`, '2026-10-30');
  assert.equal(recalls.length, 1, 'vehicles are left out');
  const r = recalls[0];
  assert.equal(r.id, 'eu:SR-03024-26');
  assert.equal(r.source, 'eu');
  assert.equal(r.alertType, 'eu-warning');
  assert.equal(r.title, 'Hema Night light (projector lamp)');
  assert.equal(r.products[0].barcode, '8720354642689');
  assert.equal(r.imageUrl, 'https://ec.europa.eu/img/1');
  assert.equal(r.riskLevel, 'serious');
  assert.ok(r.categories.includes('electrical'));
  assert.match(r.summary ?? '', /^Reported as dangerous in the EU by Luxembourg \(chemical\)\. Too much lead\./);
  assert.match(r.advice ?? '', /Action taken in the EU: Recall of the product from end users\./);
});

test('EU warnings only alert people whose cupboard matches, never by category', () => {
  const [eu] = parseEuReport(euNotification('3024', 'Electrical appliances and equipment'), '2026-10-30');
  const profiles = [{ userId: 'u1', categories: ['electrical'], allergens: [], alertTiming: 'instant' as const }];
  const cupboard = [{ id: 7, userId: 'u2', name: 'Night light', brand: 'Hema', barcode: '8720354642689', dismissedRecalls: [] }];
  const matches = matchRecallForSources(eu, profiles, cupboard);
  assert.deepEqual(matches.map((m) => [m.userId, m.reason, m.confidence]), [['u2', 'cupboard', 'barcode']]);
  assert.equal(notificationTextForSources(eu, matches[0], 'Night light').title, 'Safety warning: an item in your cupboard');
});

test('history loading works through each source a batch at a time, then stops', async () => {
  const stored = new Map<string, BackfillState>();
  const saved: string[] = [];
  const pages: Record<string, number> = {};
  const fetchFn = async (url: string) => {
    const u = new URL(url);
    if (u.hostname === 'www.gov.uk' && u.pathname === '/api/search.json') {
      const start = Number(u.searchParams.get('start') ?? 0);
      const key = u.searchParams.get('filter_format') + (u.searchParams.get('filter_alert_type') ?? '') + (u.searchParams.get('filter_organisations') ?? '');
      pages[key] = (pages[key] ?? 0) + 1;
      const results = start === 0 ? [{ link: `/x/${encodeURIComponent(key)}`, public_timestamp: '2025-01-01T00:00:00Z', title: 'Product recall alert: test' }] : [];
      return new Response(JSON.stringify({ results }));
    }
    if (u.hostname === 'www.gov.uk') return new Response(JSON.stringify({ ...vmdContent, base_path: u.pathname.replace('/api/content', '') }));
    if (u.hostname === 'data.food.gov.uk') return new Response(JSON.stringify({ items: [] }));
    if (u.hostname === 'ec.europa.eu') return new Response(euList.replace(/https:\/\/ec\.europa\.eu\/r\/\d+[^<]*/g, 'https://ec.europa.eu/report'));
    return new Response('<Safety-Gate></Safety-Gate>');
  };
  const run = () => runBackfill({
    fetchFn: fetchFn as typeof fetch,
    load: async () => [...stored.values()],
    store: async (s) => { stored.set(s.key, s); },
    save: async (recalls) => { saved.push(...recalls.map((r) => r.id)); },
    deadline: Date.now() + 60_000,
    now: new Date('2026-11-03T00:00:00Z'),
  });
  const first = await run();
  assert.deepEqual(Object.keys(first).sort(), Object.keys(BACKFILL_STEPS).sort());
  assert.ok(Object.values(first).every((r) => !r.error), JSON.stringify(first));
  assert.equal(stored.get('opss')?.fromDate, '2024-11-03');
  assert.ok(Object.values(first).every((r) => r.done), 'each fake source has fewer items than a batch');
  const second = await run();
  assert.deepEqual(second, {}, 'finished sources are skipped');
  assert.ok(saved.length > 0);
});
