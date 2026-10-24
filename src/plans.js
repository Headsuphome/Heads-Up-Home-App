// Free, Premium and Trade plans. Pure rules only, so they're easy to test and change.
//
// Safety alerts are always free. Premium is about convenience and households;
// Trade is for people who look after other people's homes and products.
// Payments aren't connected yet: until they are, Premium comes from the free trial.

export const FREE_CUPBOARD_LIMIT = 10;
export const TRIAL_DAYS = 14;

export const PRICES = {
  premiumMonthly: '£1.99',
  premiumYearly: '£14.99',
  premiumYearlySaving: 'Save 37%',
  tradeMonthly: '£9.99',
};

/** `ready` false means "coming soon": shown honestly in the plan list. */
export const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '£0',
    tagline: 'Everything you need to stay safe',
    features: [
      { text: 'Every UK recall: food, products and medicines', ready: true },
      { text: 'Alerts for your categories and allergens', ready: true },
      { text: `Cupboard of up to ${FREE_CUPBOARD_LIMIT} items`, ready: true },
      { text: 'Scan barcodes to check products and fill your cupboard', ready: true },
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: `${PRICES.premiumMonthly} a month`,
    priceNote: `or ${PRICES.premiumYearly} a year (${PRICES.premiumYearlySaving})`,
    tagline: 'For busy households',
    features: [
      { text: 'Everything in Free', ready: true },
      { text: 'Unlimited cupboard', ready: true },
      { text: 'Receipt scanning', ready: false },
      { text: 'Household sharing for the whole family', ready: false },
      { text: 'Second-hand checker for prams, car seats and toys', ready: false },
      { text: 'Refund helper and recall history', ready: false },
    ],
  },
  {
    key: 'trade',
    name: 'Trade',
    price: `${PRICES.tradeMonthly} a month`,
    tagline: 'For electricians, landlords, nurseries and care homes',
    features: [
      { text: 'Everything in Premium', ready: true },
      { text: 'Log products by job, property or room', ready: false },
      { text: 'Alerts with the customer or property affected', ready: false },
      { text: 'Records to show inspectors and insurers', ready: false },
    ],
  },
];

/** Days left on the free trial (0 when there's no trial or it has ended). */
export function trialDaysLeft(prefs, now = new Date()) {
  if (!prefs.trialEndsAt) return 0;
  const ms = new Date(prefs.trialEndsAt).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

/** The plan the person can use right now. */
export function currentPlan(prefs, now = new Date()) {
  if (prefs.plan === 'trade') return 'trade';
  if (prefs.plan === 'premium') return 'premium';
  return trialDaysLeft(prefs, now) > 0 ? 'premium' : 'free';
}

export const isPremium = (prefs, now) => currentPlan(prefs, now) !== 'free';

/** Whether another cupboard item can be added on the current plan. */
export function canAddToCupboard(prefs, now) {
  return isPremium(prefs, now) || (prefs.cupboard || []).length < FREE_CUPBOARD_LIMIT;
}

/** The changes that start a free trial, or null if one has already been used. */
export function startTrial(prefs, now = new Date()) {
  if (prefs.trialUsed) return null;
  return {
    trialUsed: true,
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
  };
}

/** A short line describing the person's plan, for badges and settings. */
export function planLabel(prefs, now = new Date()) {
  const plan = currentPlan(prefs, now);
  if (plan === 'trade') return 'Trade';
  if (prefs.plan === 'premium') return 'Premium';
  const days = trialDaysLeft(prefs, now);
  if (days > 0) return `Premium trial · ${days} ${days === 1 ? 'day' : 'days'} left`;
  return 'Free';
}
