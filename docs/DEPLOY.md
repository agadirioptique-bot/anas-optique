# OPTICOR — Deploying to production

Two Supabase projects: **opticor-dev** (linked in this repo, used by `npm run dev`, tests and Claude's MCP)
and **opticor-prod** (only you touch it). One Vercel project: Production → prod database, Preview and
Development → dev database. Do the steps in order the first time; afterwards a release is §1 + a Vercel deploy.

Each step ends with a **Check**.

**Repository and branches** — `github.com/agadirioptique-bot/anas-optique` (private, owned by the
optician's account; the developers are collaborators).

| Branch | Role | Vercel | Supabase |
|---|---|---|---|
| `develop` | day-to-day work (push here, or to a feature branch merged into it) | Preview deployments | dev |
| `main` | **production**, changed only by a pull request `develop → main` | Production branch | prod |

A release: §1 (migrations to prod, if any) → pull request `develop → main` → **merged from the optician's
GitHub account** with *Create a merge commit* (not squash). On Vercel Hobby only commits authored by the
account owner deploy, so the merge commit is what triggers the production deployment.

---

## 1. Push the migrations to opticor-prod

Migrations in `supabase/migrations/` are the only way the schema changes (never edit an applied one,
never change prod by hand).

```bash
# in a separate terminal, from the repo
npx supabase link --project-ref <PROD_PROJECT_REF>     # asks for the prod database password
npx supabase migration list                            # Local vs Remote: what will be applied
npx supabase db push                                   # applies the missing migrations, in order
npx supabase link --project-ref <DEV_PROJECT_REF>      # link back to dev right away
```

- `npm run db:push` / `db:types` always use the **linked** project. Re-link to dev as soon as you're done,
  or the next `npm run db:push` goes to prod.
- **First time only — reference data:** run `supabase/seed.sql` in the prod SQL editor (Dashboard → SQL
  Editor → paste → Run). It only holds product types, placeholder frame categories, lists (payment
  methods, lens types, reasons…), custom fields and settings, and is idempotent.
- **Never** run `supabase/seed.dev.sql` on prod (test stores). Create the real stores and the lab in
  **Paramètres › Succursales** once you can sign in (§5).

**Check:** `npx supabase migration list` shows every migration in both columns. Dashboard → Database →
Tables: the `public` tables all show "RLS enabled".

## 2. Extensions and scheduled jobs

The migrations enable what they need: `pg_trgm` (client search) in `20261103105057_extensions_enums_helpers.sql` and `pg_cron` in
`20261103142651_storage_cron.sql`, which also schedules both jobs. Nothing to click, unless the Cron
integration says "not installed": Dashboard → **Integrations** → **Cron** → **Enable pg_cron**, then run
`npx supabase db push` again (it's idempotent).

| Job | Schedule (UTC) | Does |
|---|---|---|
| `generate-recurring-charges` | `0 5 * * *` | creates this month's recurring charges as *pending* on their day + one "charges to approve" notification |
| `notify-stuck-orders` | `0 7 * * *` | "late order" notification, once per order and status, after `stuck_order_days` |

Cron runs in UTC; the app's business day is `Africa/Casablanca`. Check the current offset with
`select now() at time zone 'Africa/Casablanca';` — the jobs run before opening hours either way.

**Check:** Integrations → Cron → *Jobs* lists both, active. The day after go-live, *History* shows one
successful run of each.

## 3. Auth (Dashboard → Authentication)

### 3.1 Sign-in settings
1. **Sign In / Providers** → Email enabled. **Allow new users to sign up: OFF** (invitations only).
2. **URL Configuration**
   - Site URL: `https://<prod-domain>` (= `NEXT_PUBLIC_SITE_URL` of Production).
   - Redirect URLs: `https://<prod-domain>/**`. On the **dev** project: `http://localhost:3000/**` and
     `https://*-<vercel-team>.vercel.app/**` for previews.
3. **Password security** (Attack Protection): **Leaked password protection: ON** (HaveIBeenPwned). Minimum
   length 10 (the app asks for 10 too). (Also turn it on for dev; it is the one open Supabase security
   advisor finding there.) Do the same on **dev**, and check *Allow new users to sign up* is **OFF** there too.
4. **Rate limits**: keep the defaults; after SMTP is set, emails sent per hour ≥ 30.

### 3.2 SMTP (Resend)
Supabase's built-in mailer is for testing only (a few emails per hour). In Resend: add and verify the
domain (SPF/DKIM DNS records), create an API key with *sending* access only.
Dashboard → **Authentication** → **Emails** → **SMTP Settings** → Enable custom SMTP:

| Field | Value |
|---|---|
| Sender email / name | `no-reply@<your-domain>` / `OPTICOR` |
| Host / Port | `smtp.resend.com` / `465` |
| Username | `resend` |
| Password | the Resend API key (stays in Supabase, never in the repo or Vercel) |

**Check:** invite yourself (§5); the email arrives from `no-reply@…`, not from Supabase.

**Free alternative (in use since 2026-11-16): the optician's Gmail.** No domain needed; Gmail sends about
500 emails a day, far more than invitations and resets need.
1. Google account → **Security** → **2-Step Verification: ON** (app passwords need it).
2. <https://myaccount.google.com/apppasswords> → name `Supabase OPTICOR` → **Create** → copy the
   16-character password (shown once; it stays in Supabase, never in the repo, Vercel or a chat).
3. Supabase SMTP Settings: sender email = that Gmail address (Gmail rewrites any other sender), sender
   name `OPTICOR`, host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the app
   password.

Custom SMTP is required anyway: without it Supabase only sends to the organization's members and does
not let you edit the templates, and the default templates link to Supabase's own verify page, which
`/auth/confirm` does not accept.

### 3.3 Access token hook (role + store in the JWT)
The migration `20261103111907_auth.sql` creates `public.custom_access_token_hook` and grants it to
`supabase_auth_admin`. Enable it: **Authentication** → **Hooks** → **Add hook** → *Customize Access Token
(JWT) Claims* → type **Postgres**, schema **public**, function **custom_access_token_hook** → Create (enabled).

Without it every signed-in user is treated as having no role: RLS hides everything.

**Check (after §5):** sign in on the prod domain: a super admin lands on the **Tableau de bord** (not on
"Accès non autorisé"). Users already signed in when the hook was enabled get the claims at their next
token refresh (≤ 1 h) or by signing in again.

### 3.4 Email templates (French)
Dashboard → **Authentication** → **Emails** → **Templates** (editable only once custom SMTP is on, §3.2).
The links use the token-hash flow handled by `/auth/confirm`, which then opens the page in the user's
language. Paste the bodies in the **Source** tab, not Preview.

#### Invite user

Subject:

```
Votre accès à OPTICOR
```

Body:

```html
<h2>Bienvenue sur OPTICOR</h2>
<p>Bonjour,</p>
<p>Un compte OPTICOR vient d'être créé pour vous. Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et accéder à l'application.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password"
     style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f4c5c;color:#ffffff;text-decoration:none;font-weight:600">
    Choisir mon mot de passe
  </a>
</p>
<p>Ce lien est personnel et ne fonctionne qu'une seule fois. S'il a expiré, demandez à l'opticien de vous renvoyer l'invitation.</p>
<p>Si vous n'attendiez pas cet e-mail, vous pouvez l'ignorer.</p>
<p>— OPTICOR</p>
```

#### Reset password

Subject:

```
Réinitialisation de votre mot de passe OPTICOR
```

Body:

```html
<h2>Mot de passe oublié</h2>
<p>Bonjour,</p>
<p>Vous avez demandé à choisir un nouveau mot de passe pour votre compte OPTICOR ({{ .Email }}).</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password"
     style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f4c5c;color:#ffffff;text-decoration:none;font-weight:600">
    Choisir un nouveau mot de passe
  </a>
</p>
<p>Ce lien ne fonctionne qu'une seule fois et expire rapidement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>
<p>— OPTICOR</p>
```

**Check:** "Mot de passe oublié" on the prod login page sends this email and the link opens
`/fr/set-password`.

## 4. Vercel environment variables

Vercel → Project → **Settings** → **Environment Variables**. Values come from each Supabase project
(Settings → API).

| Variable | Production | Preview | Development | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | dev URL | dev URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon / publishable key | dev | dev | public, RLS does the protection |
| `NEXT_PUBLIC_SITE_URL` | `https://<prod-domain>` | leave empty → set per branch, or the preview URL | `http://localhost:3000` | used in invitation links |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service role / secret key | dev | dev | **server only**: mark *Sensitive*; never prefix with `NEXT_PUBLIC_` |

- Only these four are read by the app (`src/lib/supabase/env.ts`, `src/lib/supabase/admin.ts`).
- The service role key is used to send invitations (Paramètres › Utilisateurs) and by the sign-in /
  forgot-password rate limit (`src/features/auth/throttle.ts`). If it leaks, rotate it in Supabase
  (Settings → API → *Roll*), then update Vercel and redeploy.
- `NEXT_PUBLIC_SUPABASE_URL` must be set **at build time** too: the Content-Security-Policy in
  `next.config.ts` allows that Supabase origin only (without it, it falls back to `*.supabase.co`).
- Production builds mark the session cookies `Secure`: a production build only works over HTTPS (or
  `http://localhost`), not on a plain-HTTP LAN address.
- `E2E_*` and `.env.local` are for local tests on dev only; never add them to Vercel Production.

**Check:** a Production deployment's *Build Logs* show no "Missing environment variable"; the login page
loads on the prod domain.

## 5. First super admin

Nobody can invite from the app until one super admin exists. On **prod**:

1. Dashboard → **Authentication** → **Users** → **Add user** → **Send invitation** → your email.
2. **Before** clicking the link, create the profile (SQL Editor):

   ```sql
   insert into public.profiles (id, full_name, email, role)
   select id, 'Prénom Nom', email, 'super_admin'
     from auth.users
    where email = 'you@example.com';
   ```

   (`store_id` stays empty: a super admin sees every store. A secretary must have a store; the database
   refuses otherwise.)
3. Click the email link → choose a password → you land on the **Tableau de bord**.
4. **Paramètres › Succursales**: create the stores (and the lab) with their order-number prefixes.
   **Paramètres › Utilisateurs**: invite the secretaries, each attached to her store.

**Check:** a secretary's account opens **Commandes** for her own store only, and **Achats**, **Charges**,
**Tableau de bord** are not reachable (the menu hides them and the database refuses the data).

## 6. Realtime and Storage

Both come from migrations; just check them on prod.

- **Realtime:** Dashboard → Database → **Publications** → `supabase_realtime` includes `notifications`
  (migration `…_notifications_realtime.sql`). The bell then updates without reloading.
- **Storage:** bucket **`private`** exists, *not public*, 10 MB limit, images + PDF; policies on
  `storage.objects` let a user read/upload a prescription only for an order they can see; delete is super
  admin only (migration `20261103142651_storage_cron.sql`).

**Check:** upload a prescription photo on a test order, open it from another browser signed in as a
secretary of another store → refused.

## 7. Go-live checklist

- [ ] §1–§6 done on prod; Supabase project re-linked to **dev** locally.
- [ ] **Advisors** (Dashboard → Advisors) on prod:
  - Security: only *"Signed-in users can execute SECURITY DEFINER function"* (accepted: these are the
    app's RPCs, each checks role/store first, proven by `tests/db/security.test.ts`). *Leaked password
    protection* must be gone (§3.1).
  - Performance: "unused index" notes are expected on a new database.
- [ ] **Smoke test per role** on the prod domain: super admin (dashboard, a purchase, a charge, invite);
      secretary (new order with a frame from stock, payment, status to *Livrée*, WhatsApp link); a
      secretary can't open `/fr/charges` or `/fr/purchases`.
- [ ] **Backups:** Dashboard → Database → Backups: daily backups on; turn on **Point-in-Time Recovery**
      (Pro add-on) before real data goes in.
- [ ] **Domain:** Vercel → Domains → add the domain, DNS as shown, HTTPS certificate issued. The app sends
      HSTS, so serve it over HTTPS only.
- [ ] **Email:** invitation and password reset received from your domain (§3.2, §3.4).
- [ ] **Headers:** `curl -sI https://<prod-domain>/fr/login` shows `content-security-policy`,
      `strict-transport-security`, `x-frame-options`; the browser console on the dashboard, an order with a
      photo and the stock page shows no "Content Security Policy" error.
- [ ] **Brute force:** 11 wrong passwords in a row for one email → "Trop de tentatives…" (then wait 15 min).
- [ ] **Lighthouse** on the prod domain, see below.

### Rollback
- **App:** Vercel → Deployments → the previous Production deployment → **Promote** (instant).
- **Database:** migrations only move forward. Fix with a **new** migration; for data, restore with PITR to
  a point before the problem (Dashboard → Backups) — it replaces the whole database, so note the time first.

### Lighthouse (Orders and Dashboard)
`npm run lighthouse` signs in as the E2E super admin and audits `/fr/orders` and `/fr/dashboard` (mobile +
desktop) against a production build:

```bash
npm run build && npx next start -p 3200   # in another terminal; dev on :3000 can keep running
npm run e2e:accounts                       # dev only: the account the script signs in with
npm run lighthouse                         # reports in reports/lighthouse/ (git-ignored)
```

`LH_BASE_URL` points it elsewhere (it signs in with the dev E2E account, so only against a deployment that
uses the dev database, e.g. a Vercel preview).

## 8. Moving production to another Supabase project

For when the database must live in another account (done once, 2026-11: from the optician's first Gmail to
a new one). Schema comes from the migrations; data (`public` + `auth`: accounts keep their passwords) from
a copy of the old project. Prescription photos (Storage) are not in the copy: if `files` > 0 in the counts,
copy them before pausing the old project.

**Before (no downtime)**
1. New account → new project (Free, West EU), generate the database password and keep it.
2. New project → Authentication: sign-ups OFF, password minimum 10, URL Configuration (Site URL +
   `https://<prod-domain>/**`), SMTP (§3.2), templates (§3.4).
3. Old project → SQL Editor: run `scripts/move-project/counts.sql`, keep the numbers.
4. Start Docker Desktop; `docker pull postgres:17` (same major version as `postgres` in the counts).

**Switch (the app is not used meanwhile, ~30 min)**
```powershell
$d = "$HOME\Documents\opticor-backups"; New-Item -ItemType Directory -Force $d | Out-Null
# 1. copy the data of the OLD project (CLI still logged in to the old account and linked to it)
npx supabase db dump --linked --data-only --use-copy --schema public,auth -f "$d\prod-data.sql"
Copy-Item scripts\move-project\prepare-target.sql $d
# 2. schema on the NEW project
npx supabase logout
npx supabase login                               # with the new account
npx supabase link --project-ref <NEW_REF>
npx supabase db push                             # every migration; do NOT run seed.sql (the copy has it)
# 3. load the copy (session pooler URI from the new project's "Connect" button, without the password part;
#    psql asks for it). One transaction: on any error nothing is kept.
docker run --rm -it -v "${d}:/b" postgres:17 psql "postgresql://postgres.<NEW_REF>@<pooler-host>:5432/postgres" `
  -1 -v ON_ERROR_STOP=1 -f /b/prepare-target.sql -c "set session_replication_role = replica" -f /b/prod-data.sql
```
4. New project → SQL Editor: `counts.sql` gives the same numbers as the old one.
5. New project → Authentication → Hooks: the access token hook (§3.3).
6. Vercel → Environment Variables (Production): the new `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` → **Redeploy** (the URL is built into
   the CSP).
7. Sign in on the prod domain (everyone signs in again: the new project has its own signing keys; passwords
   are unchanged). `curl -sI https://<prod-domain>/fr/login`: the CSP names the new project.
8. Old project → Settings → General → **Pause project** (nothing can write to it any more); delete it after
   a week without problems. Delete `prod-data.sql` once the new project is checked: it holds personal data.
