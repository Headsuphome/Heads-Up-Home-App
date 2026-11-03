-- Heads Up Home: a Pets & animals category, and pet medicine recalls from the
-- Veterinary Medicines Directorate (source 'vmd').

-- 1. Allow the new source.
alter table public.recalls drop constraint if exists recalls_source_check;
alter table public.recalls add constraint recalls_source_check
  check (source in ('fsa', 'opss', 'mhra', 'fss', 'vmd'));

-- 2. Pet food already collected was filed under Food & drink: move it to Pets.
--    (Same rule as isPetFood in categories.ts.)
update public.recalls
set categories = array['pets']
where source in ('fsa', 'fss')
  and title ~* '\y(dog|dogs|cat|cats|puppy|puppies|kitten|kittens|pet|pets)\s+(food|foods|treats?|chews?|biscuits?|meals?|pouch(es)?|kibble|dinners?)\y|\y(food|treats?|chews?)\s+for\s+(dogs|cats|pets|puppies|kittens)\y|\yraw\s+(dog|cat|pet)\y|\y(bird ?seed|fish food|rabbit food|hamster food)\y';

-- 3. Pet products already collected: add Pets, and take them out of Toys and Baby & children.
--    (Same rule as isPetProduct in categories.ts.)
update public.recalls
set categories = array_append(array_remove(array_remove(array_remove(categories, 'toys'), 'baby-children'), 'other'), 'pets')
where source = 'opss'
  and not ('pets' = any(categories))
  and (title || ' ' || coalesce(summary, '')) ~* '\yfor\s+(dogs|cats|pets|puppies|kittens|rabbits|birds|horses)\y|\ypet\s+(beds?|carriers?|collars?|leads?|leash(es)?|harness(es)?|feeders?|fountains?|heat\w*|mats?|crates?|cages?|grooming|clippers?|hair|toys?|doors?|cameras?|trackers?|bowls?|blankets?|dryers?|products?)\y|\y(dog|cat)\s+(leads?|leash(es)?|collars?|harness(es)?|beds?|bowls?|crates?|cages?|kennels?|carriers?|chews?|clippers?|grooming|flaps?|litter|scratch\w*|trees?|trackers?|feeders?|fountains?|coats?)\y|\y(aquariums?|fish tanks?|vivariums?|bird ?cages?|hamster cages?|rabbit hutch(es)?|chew toys?|squeaky toys?)\y';

-- 4. Show how many recalls are now under Pets.
select count(*) as pet_recalls from public.recalls where 'pets' = any(categories);
