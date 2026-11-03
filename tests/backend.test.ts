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
