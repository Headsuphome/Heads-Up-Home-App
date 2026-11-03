// Our own category and allergen vocabulary. The app's chips use these keys,
// and both agencies' data is translated into them here.

export const CATEGORIES = {
  'food-drink': 'Food & drink',
  'baby-children': 'Baby & children',
  'toys': 'Toys',
  'electrical': 'Electrical',
  'trades-tools': 'Trades & tools',
  'home-furniture': 'Home & furniture',
  'cosmetics': 'Cosmetics',
  'clothing': 'Clothing & accessories',
  'medicines': 'Medicines & health',
  'pets': 'Pets & animals',
  'other': 'Other',
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

/** The 14 allergens UK food law requires to be declared. */
export const ALLERGENS = {
  celery: 'Celery',
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  'tree-nuts': 'Tree nuts',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soya: 'Soya',
  sulphites: 'Sulphites',
} as const;

export type AllergenKey = keyof typeof ALLERGENS;

// Ordered: first rule that matches wins, so specific words go before general ones.
const ALLERGEN_RULES: Array<[RegExp, AllergenKey]> = [
  [/peanut|groundnut/, 'peanuts'],
  [/\bnut|almond|hazelnut|walnut|cashew|pecan|brazil|pistachio|macadamia/, 'tree-nuts'],
  [/gluten|wheat|barley|\brye\b|\boats?\b|spelt|kamut|cereal/, 'gluten'],
  [/milk|dairy|lactose|whey|casein/, 'milk'],
  [/\beggs?\b/, 'eggs'],
  [/soy/, 'soya'],
  [/sesame/, 'sesame'],
  [/mustard/, 'mustard'],
  [/celery|celeriac/, 'celery'],
  [/lupin/, 'lupin'],
  [/sulphite|sulfite|sulphur dioxide|sulfur dioxide/, 'sulphites'],
  [/crustacean|prawn|shrimp|crab|lobster|crayfish|langoustine/, 'crustaceans'],
  [/mollusc|mussel|oyster|squid|octopus|clam|scallop|whelk|snail/, 'molluscs'],
  [/\bfish\b|anchov|cod|salmon|tuna|haddock|mackerel/, 'fish'],
];

/** Turns an agency allergen label ("Cereals containing gluten", "Egg") into our key. */
export function normaliseAllergen(label: string): AllergenKey | null {
  const text = label.toLowerCase();
  for (const [pattern, key] of ALLERGEN_RULES) {
    if (pattern.test(text)) return key;
  }
  return null;
}

/**
 * Every allergen named in a sentence such as "because of undeclared milk, egg and peanuts".
 * Only looks after words like "undeclared" or "contains", so "Peanut Butter Bars" in a product
 * name isn't mistaken for the problem.
 */
export function allergensIn(text: string): AllergenKey[] {
  const m = text.toLowerCase().match(/(?:undeclared|contains?|containing|presence of|not declared[^,]*?:?)\s+(.+)$/);
  if (!m) return [];
  const found = new Set<AllergenKey>();
  for (const part of m[1].split(/,|\band\b|&|\bor\b/)) {
    const key = normaliseAllergen(part);
    if (key) found.add(key);
  }
  return [...found];
}

const BABY_WORDS = /\b(baby|babies|infant|toddler|newborn|nursery|cot|pram|pushchair|buggy|high ?chair|car seat|teether|teething|dummy|dummies|weaning|follow-on|formula milk|children(?:'?s)?|child|kids?)\b/i;

/** True when the text is clearly about babies or children. */
export function mentionsChildren(text: string): boolean {
  return BABY_WORDS.test(text);
}

// Pet food: "Raw Frozen Dog Food", "several cat food products", "pet food pouch selections".
const PET_FOOD = /\b(?:dog|dogs|cat|cats|puppy|puppies|kitten|kittens|pet|pets)\s+(?:food|foods|treats?|chews?|biscuits?|meals?|pouch(?:es)?|kibble|dinners?)\b|\b(?:food|treats?|chews?)\s+for\s+(?:dogs|cats|pets|puppies|kittens)\b|\braw\s+(?:dog|cat|pet)\b|\b(?:bird ?seed|fish food|rabbit food|hamster food)\b/i;

// Pet products. "Dog toy" on its own is left alone: in recall notices it's usually a child's
// cuddly dog, so a toy only counts as a pet product when it's clearly for animals.
const PET_PRODUCT = /\bfor\s+(?:dogs|cats|pets|puppies|kittens|rabbits|birds|horses)\b|\bpet\s+(?:beds?|carriers?|collars?|leads?|leash(?:es)?|harness(?:es)?|feeders?|fountains?|heat\w*|mats?|crates?|cages?|grooming|clippers?|hair|toys?|doors?|cameras?|trackers?|bowls?|blankets?|dryers?|products?)\b|\b(?:dog|cat)\s+(?:leads?|leash(?:es)?|collars?|harness(?:es)?|beds?|bowls?|crates?|cages?|kennels?|carriers?|chews?|clippers?|grooming|flaps?|litter|scratch\w*|trees?|trackers?|feeders?|fountains?|coats?)\b|\b(?:aquariums?|fish tanks?|vivariums?|bird ?cages?|hamster cages?|rabbit hutch(?:es)?|chew toys?|squeaky toys?)\b/i;

/** True when a food recall is for pet food rather than food for people. */
export function isPetFood(text: string): boolean {
  return PET_FOOD.test(text);
}

/** True when a product recall is clearly for something used by pets. */
export function isPetProduct(text: string): boolean {
  return PET_PRODUCT.test(text);
}

// OPSS publishes a "product_category" slug. We match on words in it rather than
// the exact slug so new or renamed OPSS categories still land somewhere sensible.
const OPSS_RULES: Array<[RegExp, CategoryKey]> = [
  [/toy/, 'toys'],
  [/childcare|child|baby|infant/, 'baby-children'],
  [/cosmetic|personal-care|tattoo/, 'cosmetics'],
  [/electric|lighting|battery|batteries|charger|appliance|gas-appliance/, 'electrical'],
  [/tool|machinery|construction|protective|ppe|ladder|pressure|lifting|hand-tool/, 'trades-tools'],
  [/furniture|kitchen|household|home|bedding|fire|candle|chemical/, 'home-furniture'],
  [/cloth|textile|fashion|jewel|footwear|accessor/, 'clothing'],
  [/food|drink/, 'food-drink'],
];

export function categoriesForOpss(slug: string | null | undefined, text: string): CategoryKey[] {
  const found = new Set<CategoryKey>();
  const s = (slug ?? '').toLowerCase();
  for (const [pattern, key] of OPSS_RULES) {
    if (pattern.test(s)) {
      found.add(key);
      break;
    }
  }
  if (mentionsChildren(text)) found.add('baby-children');
  if (/pet|animal/.test(s) || isPetProduct(text)) {
    found.delete('toys');
    found.delete('baby-children');
    found.add('pets');
  }
  if (found.size === 0) found.add('other');
  return [...found];
}

export function categoriesForFsa(text: string): CategoryKey[] {
  if (isPetFood(text)) return ['pets'];
  const found: CategoryKey[] = ['food-drink'];
  if (mentionsChildren(text)) found.push('baby-children');
  return found;
}
