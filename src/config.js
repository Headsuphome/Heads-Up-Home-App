// Your Supabase project. The publishable key is designed to be public: it ships inside
// the app, and the database's security rules decide what it can read.
// Never put the "secret" or "service_role" key in the app.

export const SUPABASE_URL = 'https://yilalsmjbcpzdwluoprc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_vh4-1qfOOMasNvBBAgjjiQ_d41334LY';

// Our website. The privacy policy has to be reachable from inside the app (a Google Play rule),
// and the support page includes how to delete your data.
export const WEBSITE_URL = 'https://headsuphome.co.uk';
export const PRIVACY_URL = 'https://headsuphome.co.uk/privacy/';
export const SUPPORT_URL = 'https://headsuphome.co.uk/support/';
export const SUPPORT_EMAIL = 'support@headsuphome.co.uk';

// Where the recalls come from, so anyone can check the information for themselves.
export const DATA_SOURCES = [
  { name: 'Food Standards Agency', url: 'https://www.food.gov.uk/about-us/recalls-and-alerts' },
  { name: 'Food Standards Scotland', url: 'https://www.foodstandards.gov.scot/alerts' },
  { name: 'Office for Product Safety and Standards', url: 'https://www.gov.uk/product-safety-alerts-reports-recalls' },
  { name: 'Medicines and Healthcare products Regulatory Agency', url: 'https://www.gov.uk/drug-device-alerts' },
];
