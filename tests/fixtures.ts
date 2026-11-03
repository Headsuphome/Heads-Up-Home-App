// Sample records shaped like the real FSA and GOV.UK responses (field names taken
// from the live APIs; product details simplified for testing).

export const fsaRecall = {
  '@id': 'http://data.food.gov.uk/food-alerts/id/FSA-PRIN-45-2026',
  notation: 'FSA-PRIN-45-2026',
  title: 'Waitrose recalls Waitrose Essential Unsweetened Oat Drink because of poor temperature control',
  created: '2026-09-22',
  modified: '2026-09-22T10:15:00+01:00',
  type: ['http://data.food.gov.uk/food-alerts/def/Alert', 'http://data.food.gov.uk/food-alerts/def/PRIN'],
  status: { label: 'Published' },
  alertURL: 'https://www.food.gov.uk/news-alerts/alert/fsa-prin-45-2026',
  reportingBusiness: { commonName: 'Waitrose' },
  consumerAdvice: 'If you have bought the above product <b>do not drink it</b>. Instead, return it to the store from where it was bought for a full refund.',
  problem: [{ riskStatement: 'A breakdown in temperature control means the product may be contaminated and unsafe to drink.' }],
  productDetails: [{
    productName: 'Waitrose Essential Unsweetened Oat Drink',
    productCode: '5000169123456',
    packSizeDescription: '1 litre',
    batchDescription: {
      bestBeforeDescription: 'All dates between 14 August and 29 October 2026',
      batchTextDescription: 'Purchased between 2 September and 21 September 2026',
    },
  }],
};

export const fsaAllergy = {
  notation: 'FSA-AA-50-2026',
  title: 'Little Bakes recalls Kids Mini Cookies because they contain milk and egg not mentioned on the label',
  created: '2026-10-01',
  modified: '2026-10-01T09:00:00Z',
  type: ['http://data.food.gov.uk/food-alerts/def/Alert', 'http://data.food.gov.uk/food-alerts/def/AA'],
  status: { label: 'Published' },
  reportingBusiness: { commonName: 'Little Bakes' },
  problem: [{
    riskStatement: 'Milk, Egg\nThis product contains milk and egg which are not mentioned on the label.',
    allergen: [{ label: 'Milk', notation: 'milk' }, { label: 'Egg', notation: 'egg' }],
  }],
  productDetails: [{
    productName: 'Little Bakes Kids Mini Cookies',
    packSizeDescription: '6 x 20g',
    batchDescription: [{ batchCode: 'LB2241', bestBeforeDate: '2027-01-15' }, { lotNumber: 'LB2242' }],
  }],
};

export const opssReport = {
  base_path: '/product-safety-alerts-reports-recalls/product-safety-report-amdelne-tri-proof-light-2609-0076',
  content_id: 'f647755f-6c88-420e-91cc-839c95008811',
  title: 'Product Safety Report: Amdelne Tri-Proof Light (2609-0076)',
  description: 'Product Safety Report for Amdelne Tri-Proof Light presenting a serious risk of electric shock.',
  first_published_at: '2026-09-21T15:21:52+01:00',
  public_updated_at: '2026-09-21T15:21:52+01:00',
  withdrawn_notice: {},
  details: {
    metadata: {
      product_alert_type: 'product-safety-report',
      product_category: 'lighting-products',
      product_measure_type: ['destruction-of-the-product', 'import-rejected-at-border'],
      product_risk_level: 'serious',
      product_recall_alert_date: '2026-09-21',
    },
    body: '<h2 id="summary">Summary</h2><p>Tri-proof LED light.</p>' +
      '<h2 id="product-details">Product details</h2><p>Model: TP-120-40W<br>Barcode: 6971234567890</p>' +
      '<h2 id="hazard">Hazard</h2><p>The light has insufficient insulation. A user could touch live parts and get an electric shock.</p>' +
      '<h2 id="corrective-action">Corrective action</h2><p>The product was rejected at import and destroyed.</p>',
  },
};

export const opssBabyRecall = {
  base_path: '/product-safety-alerts-reports-recalls/product-recall-cosy-baby-sleep-wedge-2610-0011',
  title: 'Product Recall: Cosy Baby Sleep Wedge (2610-0011)',
  description: 'Product Recall for Cosy Baby Sleep Wedge presenting a serious risk of suffocation.',
  first_published_at: '2026-10-02T10:00:00+01:00',
  public_updated_at: '2026-10-02T10:00:00+01:00',
  details: {
    metadata: { product_alert_type: 'product-recall', product_category: 'childcare-articles-and-childrens-equipment', product_risk_level: 'serious' },
    body: '<h2>Hazard</h2><p>Babies can roll and become trapped, risking suffocation.</p><h2>What should consumers do</h2><p>Stop using it and contact the seller for a refund.</p>',
  },
};
