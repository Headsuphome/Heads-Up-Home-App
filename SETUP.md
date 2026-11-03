# Heads Up Home — backend setup guide

This is the engine behind the app. Once it's set up, it runs by itself: every hour it checks the Food Standards Agency and the Office for Product Safety and Standards for new recalls, saves them, works out who needs to know, and sends phone notifications.

You'll need about **45 minutes** the first time. Everything here is free to start.

---

## What's in the folder

| Path | What it does |
|---|---|
| `supabase/migrations/0001_init.sql` | Creates the database: recalls, products, users' preferences, cupboards, devices and alerts. Includes security rules so each person can only ever see their own data. |
| `supabase/migrations/0002_matching_and_schedule.sql` | The cupboard-matching helper and the scheduler plumbing. |
| `supabase/migrations/0003_schedule.sql` | Switches on the hourly and daily schedules. Run last. |
| `dashboard/` | Single-file copies of the functions for pasting into the Supabase dashboard (made by `scripts/bundle-for-dashboard.mjs`). |
| `supabase/functions/collect-recalls/` | The hourly job: collect → save → match → notify. |
| `supabase/functions/daily-digest/` | The 8am summary for people who chose "Daily summary". |
| `supabase/functions/_shared/fsa.ts` | Reads food recalls and allergy alerts from the FSA. |
| `supabase/functions/_shared/opss.ts` | Reads product recalls (electrical, toys, baby items, etc.) from GOV.UK. |
| `supabase/functions/_shared/matching.ts` | Decides who gets told, and how confident we are. |
| `supabase/functions/_shared/categories.ts` | Our categories and the 14 UK allergens. |
| `tests/` | Automated checks. Run `npm test` (needs Node 22.18 or newer). |

### How alerts work

Each person gets **one alert per recall**, the most important that applies:

1. **Cupboard**: something they've saved looks like the recalled product.
   - *Barcode*: exact barcode match (only possible when the agency publishes barcodes).
   - *Likely*: brand matches and most of the name matches.
   - *Possible*: partial match. The app asks them to check the batch code.
2. **Allergen**: an allergy alert for an allergen they've told us about.
3. **Category**: a recall in a category they follow.

Cupboard and allergen alerts are **always sent immediately**, because they're about safety. Only category alerts wait for the daily summary if the person chose that.

On the very first run, it loads the last 30 days of recalls so the app isn't empty, and **doesn't** notify anyone about them.

---

## Step 1: Create a Supabase project

1. Go to **supabase.com** and sign up (free).
2. Click **New project**. Name it `heads-up-home`, choose the **London (eu-west-2)** region (keeps UK users' data in the UK), and set a strong database password. Save it in a password manager.
3. Wait about 2 minutes for it to start.

## Step 2: Install the tools on your computer

You need **Node.js** (nodejs.org, the "LTS" version) and the **Supabase CLI**:

- **Mac:** `brew install supabase/tap/supabase`
- **Windows:** `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` then `scoop install supabase`
- **Either:** `npx supabase --help` also works without installing

## Step 3: Connect this folder to your project

Open a terminal in this folder and run:

```
supabase login
supabase init
supabase link --project-ref YOUR-PROJECT-REF
```

Your project ref is the random letters in your project's web address: `https://supabase.com/dashboard/project/`**`abcdefghijkl`**.

## Step 4: Create the database and deploy the functions

```
supabase db push
supabase functions deploy collect-recalls --no-verify-jwt
supabase functions deploy daily-digest --no-verify-jwt
```

`--no-verify-jwt` is needed because these functions are called by our own scheduler, not by app users. They protect themselves with the secret in the next step.

## Step 5: Set the secret password

1. Make up a long random password, for example by running `openssl rand -hex 32`. This is your **CRON_SECRET**.
2. Give it to the functions:
   ```
   supabase secrets set CRON_SECRET=paste-it-here
   ```
3. In the Supabase dashboard, open **SQL Editor** and run, using your real values:
   ```sql
   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
   select vault.create_secret('paste-the-same-CRON_SECRET-here', 'cron_secret');
   ```

Then run `supabase/migrations/0003_schedule.sql` in the SQL Editor to switch on the hourly schedule.

## Step 6: Run it once now to check

In the SQL Editor:

```sql
select public.call_function('collect-recalls');
```

After about a minute, check:

```sql
select source, title, published_at from recalls order by published_at desc limit 20;
select * from sync_state;
```

You should see recent UK recalls from both `fsa` and `opss`. If `last_error` in `sync_state` has a message, send it to me.

---

## Optional, later

- **`EXPO_ACCESS_TOKEN`**: when the app is built, create an access token at expo.dev and run `supabase secrets set EXPO_ACCESS_TOKEN=...` for extra push security.
- **Costs:** Supabase's free plan comfortably covers testing and an early launch. The Pro plan (about $25 a month) is worth moving to before real launch, because free projects pause after a week of inactivity and have no backups.

## Data licence

Recall data comes from the Food Standards Agency and the Office for Product Safety and Standards under the **Open Government Licence v3.0**. Each recall in the app must show its source and link to the original notice, and the app must say clearly that it isn't a government service. The database stores `source` and `source_url` on every recall for exactly this.
