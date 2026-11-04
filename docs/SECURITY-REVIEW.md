# OPTICOR — Security & readiness review (Phase 13, 2026-11-04)

Run on the **dev** project and this repository. Production is set up from [DEPLOY.md](DEPLOY.md); re-run the
"Check" lines there against prod after the first push.

## 1. Database (Postgres / Supabase)

| Rule | Result | Evidence |
|---|---|---|
| RLS on every table | ✅ 27/27 tables in `public` have RLS enabled, each with policies | catalog query (`pg_class.relrowsecurity`) |
| Views don't bypass RLS | ✅ 15/15 views are `security_invoker` | `pg_class.reloptions` |
| Views are read-only | ✅ `insert/update/delete/truncate` revoked on every view (migration `…_hardening`) | `tests/db/security.test.ts` "views are read-only" |
| `anon` has nothing | ✅ no table, view, sequence or function privilege in `public`, also for future objects (default privileges) | security test "anon can read no table or view", "anon can call no function" |
| Every function sets `search_path = ''` | ✅ all functions in `public` and `private` | `pg_proc.proconfig` |
| Every SECURITY DEFINER RPC checks role/store | ✅ 16 call `private.require_super_admin()`, 5 call `private.require_store_access(store)`, 5 call `private.require_role()` (shared data only) | security test, one line per RPC; the test fails if a new RPC isn't classified |
| Cron jobs / Auth hook not callable from the API | ✅ `generate_recurring_charges`, `notify_stuck_orders`, `custom_access_token_hook`: no `authenticated`/`anon` execute | security test "cron jobs and the token hook…" |
| Secretaries never read costs, purchases, suppliers, charges, audit log | ✅ `purchases`, `purchase_lines` (unit costs), `suppliers`, `supplier_payments`, `charges`, `recurring_charges`, `audit_log` and their views: 0 rows (or zeros for `purchasing_summary`) while the admin sees rows | security test + `purchasing.test.ts`, `charges.test.ts` |
| Store scope | ✅ a TSA secretary is refused every store-scoped RPC on a TSB order; nothing is written | security test |
| Multi-step writes are one function | ✅ order create/cancel/deliver/payment, purchase, supplier payment, transfer, damage, adjustment are RPCs | SPEC §6 |
| Stock never negative, only from movements | ✅ trigger `stock_movements_not_negative`, `stock_levels` view | `stock.test.ts` |
| Storage | ✅ bucket `private` (not public, 10 MB, images/PDF); read/insert only when the caller can see the order (RLS), delete super admin only | `pg_policies` on `storage.objects` |
| Foreign keys indexed | ✅ every FK has a leading-column index | catalog query |

### Supabase advisors (after the hardening migration)

- **Security**
  - **0029 "Signed-in users can execute SECURITY DEFINER function" × 26 — accepted.** These are the app's RPC API. They must be definer so that a secretary can write orders, payments and stock movements only through them (she has no direct write privilege on those tables). Each one checks role/store first and is proven in `tests/db/security.test.ts`.
  - **Leaked password protection disabled** — an Auth dashboard setting; turned on in DEPLOY.md for prod (and to do on dev).
- **Performance**: only "unused index" (INFO). They are FK indexes on a low-traffic dev database; kept. Added `stock_movements (store_id, category_id) include (qty_delta)` (index-only sums for `stock_qty` / `stock_levels`) in place of the plain `(store_id, category_id)` index.

## 2. Application

| Rule | Result | Evidence |
|---|---|---|
| Service role only on the server | ✅ `SUPABASE_SERVICE_ROLE_KEY` read only in `src/lib/supabase/admin.ts` (`import "server-only"`), used by `settings/users/actions.ts` (invites) | grep; built client chunks contain neither the variable name nor `service_role` |
| No secrets in code or history | ✅ no JWTs, `sb_secret_`, Resend keys in tracked files or git history; `.env`, `.env*.local` git-ignored | `git grep`, `git log -S` |
| `NEXT_PUBLIC_*` | ✅ only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL` | grep |
| zod on every Server Action input | ✅ all exported actions in the 18 `"use server"` files parse their input (`adminWrite`, `safeParse`, `searchInput`, `uuidInput` in `src/lib/schemas.ts`) | review + grep |
| Errors don't leak SQL | ✅ actions return `ActionResult` codes via `dbErrorCode` → translated `errors.*`; error boundaries show a generic text + digest only | `src/lib/errors.ts`, `route-states.tsx` |
| Auth links | ✅ `/auth/confirm` validates `type` with zod and only redirects to allow-listed paths (`safeConfirmNext`) | `features/auth/schemas.ts` |
| Security headers | ✅ `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; no `X-Powered-By` | `next.config.ts`, `curl -I` |
| CSP | ⏸ not yet (Next inline scripts need nonces; Supabase REST/Realtime/Storage origins). Decision in SPEC §11 | — |
| Dependencies | ✅ `npm audit --omit=dev`: 0 vulnerabilities. Dev-only tooling (eslint, shadcn's MCP SDK, lighthouse) has advisories that don't ship | `npm audit` |

## 3. UX states, accessibility, phones

- Loading skeletons for every signed-in page (`(app)/loading.tsx`, board and dashboard variants), error boundaries with "Réessayer" + reference (`(app)`, `(auth)`, `[locale]`, `global-error`), translated 404 for unknown paths (`[locale]/[...rest]`). Every list has an empty state.
- `e2e/a11y.spec.ts`: axe (WCAG 2.1 A/AA) finds **no serious/critical issue** on every page for both roles, the sign-in pages and the 404, at desktop and 375 px; **no page scrolls sideways at 375 px**; keyboard: skip link, visible focus, dialogs keep focus and give it back.
- Fixed along the way: tab and badge contrast, archived rows faded with `opacity` (also faded their controls), WhatsApp / error text shades, accessible names that didn't contain the visible text (store selector, user menu, phone link), nested controls (board cards → separate drag handle, charge rows), scrollable regions not reachable by keyboard, focus lost to `<body>` after closing any dialog.

## 4. Lighthouse

Re-run with `npm run lighthouse` (see the end of [DEPLOY.md](DEPLOY.md)). Production build (`next start` on :3200), dev database, signed in as the E2E super admin (the audited URL is the page itself, not the login).

| Page | Device | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| `/fr/orders` | mobile | 98 | 100 | 100 | 100 | 1.2 s | 150 ms | 0 |
| `/fr/orders` | desktop | 100 | 100 | 100 | 100 | 0.3 s | 0 ms | 0 |
| `/fr/dashboard` | mobile | 96 | 100 | 100 | 100 | 1.3 s | 210 ms | 0 |
| `/fr/dashboard` | desktop | 100 | 100 | 100 | 100 | 0.4 s | 0 ms | 0 |

Measured on localhost (no real network between browser and server); on Vercel expect a longer LCP from
the Supabase round trips. Charts (recharts) are already loaded lazily.

## 5. Tests

- Unit: `npm run test` · DB (RLS/RPC, incl. the security matrix): `npm run test:db` · E2E: `npm run e2e:accounts`
  then `E2E_BASE_URL=http://localhost:3000 npm run test:e2e` — the full suite (29 tests, a11y included)
  passes with nothing skipped.
