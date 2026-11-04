# OPTICOR — Auth setup

Moved to [DEPLOY.md](DEPLOY.md) §3 (sign-in settings, SMTP, access token hook, French email templates)
and §5 (first super admin). The steps are the same on **opticor-dev** and **opticor-prod**.

E2E accounts (dev only): `npm run e2e:accounts` creates or resets the Playwright users with a random
password saved in the git-ignored `e2e/.auth/accounts.json`. Next 16 runs one `next dev` per folder: if one
is already running, use `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
