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

1. Run `supabase/setup.sql` in the Supabase SQL editor (all migrations combined), or `supabase db push`.
2. **Authentication → Providers → Email**: keep enabled, turn **Confirm email OFF**.
   Phone + password login uses a private placeholder email per phone number, so no SMS is ever sent.
3. **Authentication → Providers → Google**: enable and paste the Google OAuth client ID/secret.
4. **Authentication → URL Configuration**: add your site URL (e.g. `https://balprakash.pages.dev`) and `http://localhost:5173`.
5. Create the Main Head: sign up in the app with your mobile number, then run in the SQL editor:

   ```sql
   update public.profiles set role = 'main_head' where phone = '9876543210';
   ```

   After that, the Main Head adds volunteers and the Balika Head on the **Volunteers** page.

## Roles

| | Main Head | Balika Head | Volunteer |
|---|---|---|---|
| Register Balaks / Balikas | ✅ | – | – |
| Add volunteers, start a registration year | ✅ | – | – |
| Balak list | ✅ | – | – |
| Balika list | ✅ | ✅ | only children whose books were handed to them |
| Give books (directly or to a volunteer) | ✅ both sides | ✅ Balikas | – |
| Mark as delivered | ✅ | ✅ Balikas | only books handed to them |
| Excel reports | Balak, Balika, Volunteer, Master | Balika details + distribution | their assigned / completed books |

All of this is enforced in the database (row-level security and checked functions), not only by hiding buttons.

**Logins for volunteers.** The Main Head adds a volunteer with name + mobile. The volunteer then creates an account in
the app with that mobile number and their own password, and is linked automatically. Anyone else who signs up sees
"You're not on the team yet".

## Member IDs

Every member gets a permanent ID when registered: `BP-B-0001`, `BP-B-0002` … for Balaks and `BP-G-0001` … for Balikas.
IDs are never reused (even after a delete), never typed by hand, and stay the same every year. Several children can
share a mobile number; each has their own record and ID.

## Yearly registration

The Main Head starts each registration year by hand on **Annual Registration**. New registrations are filed under the
current year; earlier years and their book history stay. To register an existing child for the new year, open them
(search or list) and use **Register for <year>**.

## Books

1. **Book Distribution → Books received**: add the issue (Gujarati monthly / English every 2 months) and record the books
   from the Karyalaya. Everyone due that issue gets a *Pending* entry automatically.
2. **Hand out books**: pick the book, select children, then
   - **Give Book**: the head handed it straight to the child, status *Given*.
   - **Give to Volunteer**: pick a volunteer (or type a name), status *Given to Volunteer*. Not delivered yet.
3. The volunteer opens **Pending Deliveries**, finds the child and taps **Mark as Delivered**, status *Delivered*.

Every change (who, when, which volunteer) is kept in `distribution_events`; **Undo** moves one step back and is recorded too.
Changes made without signal are saved on the phone and sent when it's back online.

## Adding many members

**Register Member → Upload CSV** (download the template first). One row per child; columns `name, phone, category,
mandal, address, dob, language, plan_years, issues_remaining, receipt_no, amount, payment_mode`. Re-uploading the same
sheet doesn't duplicate anyone. Mandals named in the sheet are added to the mandal list.

## Issue numbering

Issues are numbered per language with a running `seq_no` (1, 2, 3 …). A registration covers
`start_issue_seq` to `start_issue_seq + total_issues - 1` (12 / 36 Gujarati, 6 / 18 English).

## Free-tier maintenance (GitHub Actions)

Add these repository secrets:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: used by the daily keep-alive ping.
- `SUPABASE_DB_URL`: Session pooler connection string, used by the weekly backup.

## Deploy (Cloudflare Pages)

Connect the GitHub repo. Build command `npm run build`, output directory `dist`,
and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
