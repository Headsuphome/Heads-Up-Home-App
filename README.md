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

## Installable test version (Android)

GitHub builds an installable `.apk` and puts it on the **Releases** page. To start a build, open
**Actions → Android test build → Run workflow**. It takes about 20 minutes.

Phone alerts need Firebase: add the contents of `google-services.json` as a repository secret
called `GOOGLE_SERVICES_JSON` (Settings → Secrets and variables → Actions). The Firebase
service-account key never goes in GitHub; it's uploaded to Expo instead.

## Website

`website/` holds headsuphome.co.uk: the home page, the privacy policy (`/privacy/`) and help and support
(`/support/`, which includes how to delete your data). Edit `scripts/build-website.py`, run
`python3 scripts/build-website.py`, then upload everything inside `website/` to the site's root folder.
The pages load nothing from other companies: no fonts, scripts, cookies or trackers.

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
| `assets/` | App icon and notification icon (`scripts/make-icons.py` draws them) |
| `app.config.js` | Build-only settings, such as Firebase and the build number |
| `.github/workflows/` | The Android test build |

## Data

Recall data comes from the Food Standards Agency and the Office for Product Safety and Standards,
used under the Open Government Licence v3.0. Heads Up Home is not a government service.
