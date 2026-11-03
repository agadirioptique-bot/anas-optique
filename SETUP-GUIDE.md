# OPTICOR — Setup guide (Windows / PowerShell)

Kit content:

```
opticor/
├─ CLAUDE.md                ← Claude Code reads this automatically every session
├─ .mcp.json                ← Supabase MCP (dev project only)
├─ .claude/settings.json    ← what Claude may run without asking / never touch
├─ docs/SPEC.md             ← architecture we decided (source of truth)
├─ docs/DESIGN.md           ← UI copied from the demo (tokens, shell, screens)
├─ docs/PROMPTS.md          ← kickoff + 13 phase prompts
└─ SETUP-GUIDE.md           ← this file
```

---

## Step 1 — Accounts & tools

1. Install **Node.js LTS**, **Git**, and **Claude Code** (if not already).
2. Accounts: GitHub, Supabase, Vercel, and **Resend** (for real emails, free tier is enough to start).
3. Check:

```powershell
node -v; npm -v; git --version; claude --version
```

## Step 2 — Create the two Supabase projects

On supabase.com → New project, twice:

| Project | Use | Region |
|---|---|---|
| `opticor-dev` | development, Vercel previews, Claude's MCP | West EU (Paris) — closest to Morocco |
| `opticor-prod` | the optician's real data | same region |

Save each **database password** in your password manager. From each project's *Project Settings*, note:
- **Project ref** (the id in the URL `supabase.com/dashboard/project/<ref>`)
- **Project URL**
- **Publishable / anon key** (public) and **Secret / service_role key** (secret, server only)

## Step 3 — Create the repo with the kit

```powershell
mkdir C:\dev\opticor; cd C:\dev\opticor
git init
# copy the kit files here (CLAUDE.md, .mcp.json, .claude\, docs\, SETUP-GUIDE.md)
```

**Optional but strongly recommended — UI reference:** copy the demo's source code into `_reference\opticor-demo\` so Claude copies the exact components instead of guessing from screenshots. Keep it out of git:

```powershell
Add-Content .gitignore "`n_reference/`n.env*.local`n.env"
```

Optional: take screenshots of each demo page (desktop + phone width) into `docs\ui\` — Claude Code can read images.

## Step 4 — Connect Claude Code to Supabase (MCP)

Claude can create tables, run SQL checks and read the security advisors on your **dev** project through the official Supabase MCP server. Never connect it to prod.

1. Open `.mcp.json` and replace `YOUR_DEV_PROJECT_REF` with the **opticor-dev** ref.
   (Equivalent command, if you prefer:)

```powershell
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=YOUR_DEV_PROJECT_REF&features=docs%2Cdatabase%2Cdebugging%2Cdevelopment"
```

2. Start Claude Code in the repo, then authenticate:

```powershell
cd C:\dev\opticor
claude
```

Inside Claude Code: type `/mcp` → select **supabase** → **Authenticate** → log in in the browser → choose your organisation. Restart Claude Code if the tools don't appear.

3. Test: ask Claude *"Using the Supabase MCP, list the tables of the dev project."* (empty for now is fine).

Safety rules (from Supabase's own recommendations):
- `project_ref` locks the server to **dev** only; account-level tools are disabled.
- Keep manual approval of tool calls on — read each `execute_sql` / `apply_migration` before accepting.
- Never paste keys or passwords in the chat. Secrets go in `.env.local` and Vercel only.

## Step 5 — Supabase CLI (migrations)

No install needed, we use `npx`:

```powershell
npx supabase@latest login
```

Claude will run `supabase init` and `supabase link --project-ref <dev-ref>` in Phase 2. Migrations are SQL files in `supabase\migrations\`, applied with `npm run db:push`. To prod you push the same files later (Phase 13 / DEPLOY.md), never by hand.

## Step 6 — Local environment file

Create `.env.local` yourself (Claude is denied from reading it):

```powershell
@"
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_DEV_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_DEV_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_DEV_SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
"@ | Out-File -Encoding utf8 .env.local
```

> PowerShell tip: when saving command output to a file, use `| Out-File -Encoding utf8 file` — a plain `>` in Windows PowerShell writes UTF-16 and breaks generated TypeScript types.

## Step 7 — Supabase Auth settings (do on dev now, on prod before launch)

Dashboard → **Authentication**:
1. *Sign In / Providers*: Email enabled, **"Allow new users to sign up" OFF** (invitations only).
2. *URL Configuration*: Site URL `http://localhost:3000` on dev (your real domain on prod). Redirect URLs: `http://localhost:3000/**`, your Vercel preview pattern `https://*-<your-vercel-team>.vercel.app/**`, and the prod domain.
3. *SMTP*: connect Resend (host, port, user, API key as password, sender like `no-reply@yourdomain`). Supabase's built-in mailer is only for testing.
4. *Email templates*: Claude gives you FR templates with token-hash links in Phase 3.
5. *Hooks*: enable **Custom Access Token** → `public.custom_access_token_hook` (after Phase 3 creates it).
6. *Integrations → Cron*: enable **pg_cron** (Phase 4).

## Step 8 — Vercel

1. Push the repo to GitHub (private), import it in Vercel.
2. Environment variables:
   - **Preview** + **Development** → dev values (URL, anon key, service role key, `NEXT_PUBLIC_SITE_URL` = preview URL handling done by Claude).
   - **Production** → prod values, `NEXT_PUBLIC_SITE_URL=https://your-domain`.
3. Every PR gets a preview on the dev database; `main` deploys to production.

## Step 9 — First super admin (after Phase 3)

1. Supabase dashboard (dev) → Authentication → Users → **Invite user** → your email → accept the email and set a password.
2. SQL Editor:

```sql
insert into public.profiles (id, full_name, email, role)
select id, 'Ali Akouhar', email, 'super_admin'
from auth.users where email = 'YOUR_EMAIL'
on conflict (id) do update set role = 'super_admin', is_active = true;
```

3. Sign in → Settings › Stores and lab → create the stores + lab → Settings › Users → invite the secretaries.
Repeat on prod at launch (with the optician's email).

---

## Step 10 — How to work with Claude Code (vibecoding the safe way)

1. **Kickoff first** (`docs/PROMPTS.md`). Answer its questions; let it update SPEC.md.
2. **One phase per session.** `/clear` before each new phase so the context is clean; CLAUDE.md and docs are reloaded automatically.
3. **Plan mode every time** (`Shift+Tab` until "plan mode"). Read the plan: right files? right tables? tests included? Fix it before approving.
4. **Branch per phase**: `git switch -c phase-06-orders`. Merge to `main` only when green.
5. **Make it prove its work**: ask for `npm run typecheck && npm run lint && npm run test`, and open the page yourself. For permissions, log in as the secretary and try forbidden things.
6. **Review with a second pair of eyes** before merging: *"Use a subagent to review this branch's diff against docs/SPEC.md and CLAUDE.md rules; list violations only."*
7. **Interrupt early**: `Esc` stops Claude. Point to the exact SPEC section rather than re-explaining.
8. **Long session?** `/compact` to summarise, or finish the step, commit, `/clear`.
9. **Screenshots help**: drag a demo screenshot into Claude Code with "make this page match".
10. **Keep the docs alive**: any decision changed in chat → ask Claude to update `docs/SPEC.md` in the same commit. CLAUDE.md stays short.
11. **Production is yours**: Claude never runs anything against prod. You push migrations to prod with the steps in `docs/DEPLOY.md` (Phase 13).
