# OPTICOR — Auth setup (Supabase dashboard)

Do this on **opticor-dev** now and on **opticor-prod** before launch (Phase 13 / DEPLOY.md).
The migration `…_auth.sql` must already be pushed (it creates `public.custom_access_token_hook`).

## 1. Sign-in settings

Dashboard → **Authentication**:

1. **Sign In / Providers** → Email: enabled. **Allow new users to sign up: OFF** (invitations only).
2. **URL Configuration**
   - Site URL: `http://localhost:3000` on dev (= `NEXT_PUBLIC_SITE_URL`), the real domain on prod.
   - Redirect URLs: `http://localhost:3000/**`, `https://*-<your-vercel-team>.vercel.app/**`, the prod domain + `/**`.
3. **SMTP** (prod, and dev if you want more than a few test emails per hour): Resend host/port/user, API key as password, sender `no-reply@<your-domain>`.

## 2. Enable the Custom Access Token Hook

Dashboard → **Authentication** → **Hooks** → **Add hook** → **Customize Access Token (JWT) Claims hook**:

1. Hook type: **Postgres**
2. Postgres schema: **public**
3. Postgres function: **custom_access_token_hook**
4. **Create hook** (make sure it is enabled).

Users who were already signed in get the new claims at their next token refresh (≤ 1 h) or by signing in again.

Check: after signing in, the access token contains `"app_role": "super_admin"` (or `"secretary"` + `"store_id"`).

## 3. Email templates (French)

Dashboard → **Authentication** → **Emails** → **Templates**. The links use the token-hash flow handled by `/auth/confirm`; the app then opens the page in the user's language.

### Invite user

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

### Reset password

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

## 4. First super admin (once per project)

Nobody can invite from the app until one super admin exists:

1. Dashboard → **Authentication** → **Users** → **Add user** → **Send invitation** → your email.
2. **Before** clicking the email link, create the profile (SQL editor; on dev Claude can run it through MCP):

   ```sql
   insert into public.profiles (id, full_name, email, role)
   select id, 'Prénom Nom', email, 'super_admin'
     from auth.users
    where email = 'you@example.com';
   ```

3. Click the link → choose a password → you land on the Dashboard. Invite everyone else from **Paramètres › Utilisateurs**.

## 5. E2E test accounts (dev only)

Add to `.env.local` (never commit): `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD`, `E2E_SECRETARY_EMAIL`, `E2E_SECRETARY_PASSWORD`. `npm run test:e2e` signs in with them; the tests that need them are skipped otherwise.
Next 16 runs only one `next dev` per folder: if one is already running, use `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
