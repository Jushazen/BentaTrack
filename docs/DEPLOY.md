# Deploying BentaTrack

How to put BentaTrack into production on **Vercel** (app), **Neon** (PostgreSQL) and **Vercel Blob** (product images), as required by SRS §2.4 and §3.4 (amendments D2, D5).

Who does what:

- **Owner:** owns the Vercel account (Neon and Blob are added from inside Vercel) and chooses the owner password.
- **Team:** runs the setup steps with the owner and runs the checks.

Never paste secrets into chat, tickets, or commits. This guide names environment variables only.

## 1. Before you start

- A Vercel account (Hobby is enough to start) with this GitHub repository imported, or access to import it.
- A computer with this repository, Node 22 or newer, and `npm install` already run.
- 30 minutes with the owner present for step 5.

## 2. Create the database and image storage

All three services go in **Singapore**, the closest region to Calbayog. Pages load fastest when the app and database sit together. `vercel.json` already pins the app to `sin1`.

1. In Vercel, open the project, then **Storage → Create → Neon (Postgres)**.
   - Region: **AWS ap-southeast-1 (Singapore)**.
   - Connect it to the project for **Production** and **Preview**.
   - Turn on **preview branches**, so each preview deployment gets its own copy of the database. (Previews also run migrations; without this, a preview could change the live database.)
   - This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Keep both.
2. In Vercel, **Storage → Create → Blob**, region Singapore, connected to Production and Preview. This sets `BLOB_READ_WRITE_TOKEN`.

## 3. Set environment variables

In Vercel, **Project → Settings → Environment Variables**, for **Production** (and Preview where noted):

| Variable | Value | Preview too? |
|---|---|---|
| `DATABASE_URL` | set by Neon in step 2 | yes (set by Neon) |
| `DATABASE_URL_UNPOOLED` | set by Neon in step 2 | yes (set by Neon) |
| `BLOB_READ_WRITE_TOKEN` | set by Blob in step 2 | yes (set by Blob) |
| `NEXTAUTH_SECRET` | a new random secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Use a different one from local dev. | yes (can be a separate one) |
| `NEXTAUTH_URL` | the production address, e.g. `https://bentatrack.vercel.app` (or the custom domain) | no (leave unset) |

Do **not** set `TEST_DATABASE_URL`, `DEV_ALLOWED_ORIGINS`, `SEED_OWNER_EMAIL`, or `SEED_OWNER_PASSWORD` in Vercel.

## 4. Deploy

Push to the production branch (`main`), or click **Deploy** in Vercel. The build command in `vercel.json`:

1. runs `prisma migrate deploy` over the direct (unpooled) connection, which creates or updates the tables;
2. runs `npm run build`.

If a migration fails, the build stops and the running site is left unchanged.

HTTPS is automatic on Vercel. `vercel.json` also sends `Strict-Transport-Security`, so browsers stay on HTTPS.

## 5. Create the owner account (with the owner)

The seed creates the first Owner and the starter categories, and it is safe to run again. It never changes an account that already exists. **The owner types their own password**, so nobody else ever knows it.

On the team computer, in PowerShell, from the repository folder:

```powershell
# Direct (unpooled) Neon connection string: Vercel → Storage → your Neon database → .env.local tab
$env:DATABASE_URL = Read-Host "Neon direct connection string"
$env:SEED_OWNER_EMAIL = Read-Host "Owner email"
# The owner types this. It is not shown on screen or saved in history. At least 8 characters.
$secure = Read-Host "Owner password" -AsSecureString
$env:SEED_OWNER_PASSWORD = [Net.NetworkCredential]::new("", $secure).Password
npm run db:seed
```

Expected output: `Seed done: owner created, 3 new categories.` Then **close that PowerShell window**, which clears the variables. Values already in the shell take priority over `.env`, so the local `.env` is not touched.

The owner then logs in at the production address with that email and password. Staff accounts are added from **Users** inside the app.

## 6. Check the deployment

Add the production address to your local `.env` as `PRODUCTION_URL` (see `.env.example`), then run:

```bash
node scripts/gates/check-deploy.mjs
```

It checks four things:

- the login page loads over HTTPS;
- `http://` redirects to `https://`;
- HSTS is sent with a max-age of at least one year;
- `/api/health` reports the database reachable.

Every line should say `PASS`, ending with `DEPLOY OK`.

Then, on a phone:

1. Open the production address and log in once while online.
2. Add it to the home screen (the app works offline only over HTTPS, which production has).
3. Turn on airplane mode, then browse products and record a test sale.
4. Turn airplane mode off and confirm the sale syncs.

## 7. Custom domain (optional)

**Vercel → Project → Settings → Domains**: add the domain and follow the DNS steps. HTTPS certificates are issued automatically. Then update `NEXTAUTH_URL` to the new address and redeploy.

## 8. Monitoring

- `GET /api/health` returns `200 {"status":"ok","database":"ok"}` when healthy and `503` when the database cannot be reached. It is safe to point an uptime monitor at it (for example, Vercel's or UptimeRobot's free tier).
- Errors appear in **Vercel → Project → Logs**.

## 9. Rolling back

- **App:** in **Vercel → Deployments**, open the last good deployment, then **Promote to Production** (Instant Rollback). This takes seconds.
- **Database:** migrations only move forward, and a rollback of the app does not undo them. Before any migration that removes or renames data, make a Neon **branch** of production as a restore point. To recover lost data, use Neon's **restore** to a point in time (within the plan's history window).
- **Forgotten owner password:** there is no in-app reset for the owner. With the team, connect to the database as in step 5 and ask the team to set a new hash. Keep the database connection string away from anyone who does not need it.
