# Heads Up Home

UK product recall alerts, from baby food to electricals. This is the phone app (Expo / React Native).
The recall engine that collects recalls every hour lives in a separate Supabase project.

## What's in version 0.1

- **Home**: the latest UK recalls, a "For you" filter, and a warning banner when something in your cupboard may be affected
- **Recall details**: what's wrong, how to check your pack (batch codes, best-before dates, barcodes), what to do, and a link to the official notice
- **Browse**: search every recall, or browse by category
- **My cupboard**: add products by name and brand; they're checked against every recall
- **My alerts**: choose categories and the 14 UK allergens that matter to your household

Personal choices and cupboard items are stored only on the phone in this version.

## Coming next

Accounts, phone notifications, barcode scanning and receipt scanning.

## Project layout

| Path | What it is |
|---|---|
| `App.js` | Navigation, tab bar and data loading |
| `src/screens/` | One file per screen |
| `src/logic.js` | Categories, allergens, matching and filtering (no React, fully tested) |
| `src/api.js` | Reads recalls from Supabase |
| `src/config.js` | Supabase address and publishable key (safe to be public) |
| `src/theme.js` | Colours and spacing |
| `tests/` | `npm test` runs the logic tests |

## Data

Recall data comes from the Food Standards Agency and the Office for Product Safety and Standards,
used under the Open Government Licence v3.0. Heads Up Home is not a government service.
