# OPTICOR

@AGENTS.md

Multi-store ERP + BI for an optician (Morocco). Next.js App Router + Supabase + Vercel. FR (default) / EN.

## Read before working
- `docs/SPEC.md` — behaviour, data model, permissions, KPIs. **Source of truth.**
- `docs/DESIGN.md` — UI tokens, shell, components, screen list (match the demo https://opticor.vercel.app).
- `docs/PROMPTS.md` — the build phases. Work on one phase at a time.
- `_reference/opticor-demo/` (if present) — demo source: copy UI only, never its localStorage data layer.

## Commands
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run test:db` (RLS/RPC tests against DEV) · `npm run test:e2e`
- `npm run db:new -- <name>` new migration · `npm run db:push` apply migrations to the linked (dev) project · `npm run db:types` regenerate `src/types/database.ts`

## Structure
- `src/app/[locale]/(auth)/…` login, set-password, forgot-password · `src/app/[locale]/(app)/…` pages · `src/app/auth/confirm/route.ts`
- `src/lib/supabase/{server,client,admin}.ts` — `admin.ts` (service role) is server-only, import `server-only`
- `src/features/<domain>/` (orders, clients, stock, purchases, charges, dashboard, settings, auth): `actions.ts` (Server Actions), `queries.ts`, `schemas.ts` (zod), `components/`
- `src/components/ui/` shadcn · `messages/{fr,en}.json` next-intl · `supabase/migrations/` SQL · `supabase/seed.sql`

## Non-negotiable rules
1. **Security lives in Postgres**: RLS on every table + role/store checks inside every `security definer` function (`set search_path = ''`). UI hiding is cosmetic.
2. Secretaries must never be able to read costs, purchases, suppliers, charges, audit log — test it.
3. Multi-step writes (order create, cancel, purchase, transfer, payment, damage, adjustment) = **one Postgres function** called via `supabase.rpc`. No multi-request writes from the client.
4. Schema changes **only** via new files in `supabase/migrations/` (never edit an applied migration, never change schema with ad-hoc SQL). After a migration: `db:push` → `db:types` → run Supabase advisors (MCP `get_advisors`) and fix findings.
5. Money = `numeric(12,2)` summed in SQL. Dates = `timestamptz`; business day in `Africa/Casablanca`.
6. Stock quantity only from `stock_movements`; never negative.
7. Never use `SUPABASE_SERVICE_ROLE_KEY` outside `src/lib/supabase/admin.ts`; never prefix secrets with `NEXT_PUBLIC_`; never read or print `.env*` files.
8. Every user-facing string goes in `messages/fr.json` and `messages/en.json` (French first). No hard-coded text.
9. Validate every Server Action input with zod; map DB error codes `OPTICOR:*` to translated messages.
10. Supabase MCP is connected to the **dev** project only. Never touch production from this session.

## Way of working
- Start each phase in plan mode; wait for my OK before coding.
- Small steps; after each step run `npm run typecheck && npm run lint && npm run test`.
- For UI work, check the page in the browser (desktop + mobile width) against the demo.
- Conventional commits at the end of each working step (`feat(orders): …`). Don't push unless asked.
- If the spec is ambiguous or you must deviate, ask me — and update `docs/SPEC.md` in the same change.
- Keep this file short; put details in `docs/`.
