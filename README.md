# Bal Prakash Delhi

Subscription, stock and distribution management for Bal Prakash (Gujarati monthly, English bi-monthly).
Runs entirely on free tiers: Vite + React + Tailwind 3.4 on Cloudflare Pages, Supabase for database and auth.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

## Supabase setup (one time)

1. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or `supabase db push`).
2. **Authentication → Providers → Email**: keep enabled, turn **Confirm email OFF**.
   Phone + password login uses a private placeholder email per phone number, so no SMS is ever sent.
3. **Authentication → Providers → Google**: enable and paste the Google OAuth client ID/secret.
4. **Authentication → URL Configuration**: add your site URL (e.g. `https://balprakash.pages.dev`) and `http://localhost:5173`.
5. Create the Main Head: sign up in the app, then run in the SQL editor:

   ```sql
   update public.profiles set role = 'main_head' where phone = '9876543210';
   ```

   After that, the Main Head assigns all other roles from **Team & roles**.

## Roles

| Role | Sees / does |
|---|---|
| Main Head | Everything, both Balak and Balika. Manages roles and registration windows. |
| Balika Head | Only Balika records. Adds/imports Balikas, records Balika stock. |
| Volunteer | Only their assigned side. Marks distribution (later phase). |
| Subscriber | Only their linked family. |

The Balak/Balika separation is enforced by row-level security in the database.

## Adding data

- **Areas**: Areas page → add one, or upload a CSV with a `name` column.
- **Existing balaks/balikas**: Members page → *+ Add member*, or *Upload CSV* (download the template first).
  One row per child; rows with the same phone go into the same family. Re-uploading the same sheet doesn't create duplicates.
  For existing subscribers part-way through a plan, fill `issues_remaining`.
- **Online registration** (Phase 2) writes into the same tables, marked *Online form*.

Each family gets a 6-letter **family code**. Parents link their login to their family on **My family** with
their phone number + that code.

## Issue numbering

Issues are numbered per language with a running `seq_no` (1, 2, 3 …). A subscription covers
`start_issue_seq` to `start_issue_seq + total_issues - 1`. When stock is recorded for an issue, pending
distribution rows are created automatically for every eligible active subscriber.

## Free-tier maintenance (GitHub Actions)

Add these repository secrets:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: used by the daily keep-alive ping.
- `SUPABASE_DB_URL`: Session pooler connection string, used by the weekly backup.

## Deploy (Cloudflare Pages)

Connect the GitHub repo. Build command `npm run build`, output directory `dist`,
and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
