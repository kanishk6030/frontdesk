# Frontdesk

A support workspace with one ticket owner, business-hour SLAs, a customer portal, private team notes, and append-only audit evidence.

Implemented with React/Vite/JSX/Tailwind/React Router/TanStack Query, Express ES modules/Zod, PostgreSQL 17 and Prisma 7. No TypeScript application or compilation pipeline. The approved policy is in [Business rules](docs/10-BUSINESS_RULES.md); actual verification and timing are in [Implementation evidence](docs/16-IMPLEMENTATION_LOG.md).

**Status:** application works locally. Vercel/Render configuration and maintenance workflow are prepared. No live deployment or remote repository URL has been verified. See [Unfinished work](UNFINISHED.md) before treating this as a hosted submission.

## Local setup — PowerShell

Prerequisites: Node **24 LTS**, npm, Docker Desktop with its Linux engine running, and Git. The verified runtime is Node 24.22.3. This workspace also has a checksum-verified portable runtime under ignored `.tools/node-v24.22.3-win-x64`; it is not part of a clone. If using that existing local runtime, prepend its directory to this terminal's PATH. Otherwise install Node 24 normally. Do not use the system Node 23 installation for this project.

Run from the repository root. Commands below are sequential; stop if any command fails.

For this already-prepared workspace only, select its portable runtime in **each** PowerShell terminal before the commands below:

```powershell
$env:Path = (Join-Path (Get-Location) '.tools/node-v24.22.3-win-x64') + ';' + $env:Path
```

A fresh clone does not contain `.tools`; use your installed Node 24 instead. If the ignored `.env` files already exist, skip `setup-local.js` and preserve them.

```powershell
node --version
docker version
node backend/scripts/setup-local.js
docker compose up -d --wait
docker compose ps
docker compose logs --tail 20 postgres
Set-Location backend
npm ci
npm run db:provision
npm run prisma:validate
npm run prisma:generate
npm run db:migrate:deploy
npm run db:grants
npm run db:migrate:test
npm run db:grants -- --test
npm run db:verify
npm run db:seed
```

`setup-local.js` creates random secrets in ignored root `.env` and a separate `backend/.env` containing only web-runtime settings. It refuses to overwrite an existing root `.env`. `.env.example` documents every setting. Do not copy the root operator file into the web service. Configure `FRONTDESK_HOLIDAYS` in the backend runtime environment as a JSON array of approved local dates; the demo default is empty, not a real festival calendar.

Compose uses official `postgres:17`, a named persistent volume and **127.0.0.1:5432** only. Its initial `frontdesk` administrator provisions `frontdesk_owner`/`frontdesk_runtime` for development and `frontdesk_test_owner`/`frontdesk_test_runtime` for the isolated `frontdesk_test` database. Provisioning preserves existing users/data; it does not silently rotate passwords. A password mismatch after manual environment edits requires deliberately reconciling the existing role, not deleting the volume.

Prisma migrations use the owner URL. The application, sessions and integration assertions use the restricted runtime URL. CHECK constraints, FK restrictions, append-only rejection triggers, audit timestamp trigger and indexes are versioned in migrations. The reviewed `scripts/grant-runtime.js` applies the database-role-specific grants after migrations. Runtime cannot update/delete/truncate entries or audit, delete tickets, change roles, create schema objects or assume the owner.

## Start the app

In one terminal, from `backend`:

```powershell
npm run dev
```

In another terminal, from the repository root:

```powershell
Set-Location frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173**. API readiness is **http://localhost:3000/healthz**. Vite forwards `/api` to Express; use the frontend URL for login. The local `APP_ORIGIN` is exactly `http://localhost:5173`; using `127.0.0.1` in the browser changes the origin and correctly fails mutation validation.

| Username | Role | Password source |
| --- | --- | --- |
| `agent.ava` | Agent | Root `.env`: `DEMO_AGENT_PASSWORD` |
| `agent.ravi` | Agent | Same agent demo password |
| `customer.maya` | Customer | Root `.env`: `DEMO_CUSTOMER_PASSWORD` |
| `customer.arun` | Customer | Same customer demo password |

Read the ignored file locally to obtain passwords; never publish infrastructure credentials. Share only demo account credentials with an authorized reviewer. Rerunning the seed preserves accounts and existing `[DEMO]` tickets. Synthetic evidence is marked with `fixture=true`; browser walkthroughs add visibly labeled `[BROWSER TEST]` tickets and do not delete existing data.

### Login and Windows install troubleshooting

- The values in `.env.example` are placeholders. Use the demo passwords from the ignored root `.env`; usernames are case-insensitive, while passwords are not.
- Run `npm run db:seed` after migrations and grants. Seeding preserves an existing user's password hash, so changing a demo-password variable later does not rotate that account. Deliberate password rotation is an operator action, not a reason to delete the database volume.
- Browse to `http://localhost:5173`, not `127.0.0.1`, and confirm `http://localhost:3000/healthz` returns ready before signing in.
- Stop existing Frontdesk frontend/backend development processes before `npm ci`. On Windows, a running Vite process can hold `lightningcss` open and cause `EPERM`; stop only the process verified to belong to this workspace, then retry.
- A successful login persists through the database-backed session cookie. If the UI was already open while a server was restarted, reload it once so CSRF state is bootstrapped from the current process.

Agent queue defaults to **Mine / Active**. Choose **Unassigned** to claim new tickets. Only the owner can write. Customer Maya owns the seeded tickets; Arun demonstrates cross-customer isolation.

## Verify

From `backend`, with Docker healthy and test migrations/grants applied:

```powershell
npm test
npm run lint
npm run check:stack
npm run prisma:validate
npm run prisma:generate
npm run db:verify
npm run check:performance
```

From `frontend`:

```powershell
npm test
npm run lint
npm run build
npm run test:browser
```

The browser check requires both local servers, seeded accounts, the ignored root `.env`, and installed Microsoft Edge. It runs headlessly using Playwright, tests account switching in the same browser, and writes screenshots to ignored `.local/`. Integration tests use real PostgreSQL, separate cookie sessions and independently connected claim contenders. They append isolated test fixtures and never reset the development DB or disable production evidence triggers. Performance checking adds 2,000 test-only rows; it is optional for routine regression.

The runtime dependency audit is `npm audit --omit=dev --omit=optional` in backend; frontend uses `npm audit`. The full pinned Prisma 7.0.0 toolchain currently has **14 high-severity audit findings**. Its optional CLI peer dependency also survives a plain `--omit=dev`; production must omit optional packages **after** generating the client. No `audit fix --force` or silent Prisma upgrade has been applied. Do not expose Prisma Studio/dev servers publicly.

## Stop and preserve data

For local database inspection, run `npm run db:studio` from `backend`, then open `http://127.0.0.1:5555`. This wrapper uses the restricted runtime URL, sets read-only sessions, disables automatic browser launch and explicitly binds Studio to loopback. Prisma 7.0.0's raw Studio command has no hostname option and otherwise listens broadly; do not use it on an exposed host. Close Studio with Ctrl+C. It is an optional local operator tool, never a deployed application component. Runtime evidence restrictions still apply; read-only session defaults are an inspection safeguard, not a new database-owner guarantee.

Stop each development server with Ctrl+C. From the root:

```powershell
docker compose down
docker compose up -d --wait
```

`down` preserves the named data volume. Never use `down -v`, `prisma migrate reset`, `db push`, destructive reseeding, or manual evidence deletion as a setup shortcut. Do not run integration tests against production. Back up persistent data before intentional schema changes.

## Deployment preparation

1. Push this repository to your authorized Git host and record its URL. No remote has been configured here.
2. Provision hosted PostgreSQL 17 with separate migration-owner/runtime users. The initial managed connection is usually privileged: do not use it as `DATABASE_URL` for the app. Verify provider role management and TLS requirements first. Do not disable certificate verification. `db:provision` is deliberately local-only; create hosted principals with the provider's operator tools.
3. In an operator-only environment, set `MIGRATION_DATABASE_URL` and restricted `DATABASE_URL`, then run backend `npm ci`, `npm run prisma:generate`, `npm run db:migrate:deploy`, `npm run db:grants`, and `npm run db:seed` with demo-password variables. Seed once; never on every web restart. Remove operator secrets from any web process environment.
4. Import `render.yaml` into Render, or use equivalent Railway settings: root `backend`; Node 24; build `npm ci --include=dev && npm run prisma:generate && npm prune --omit=dev --omit=optional`; start `npm start`; health `/healthz`. Provide only restricted `DATABASE_URL`, `APP_ORIGIN`, stable `SESSION_SECRET`, `JOB_TOKEN`, `FRONTDESK_HOLIDAYS`, `TZ=UTC`, `NODE_ENV=production`, and verified `TRUST_PROXY_HOPS=1`. No migrations or seeding run at startup. Do not incur a paid tier without approval.
5. Once the chosen backend hosting provider gives you its actual HTTPS origin, run from `frontend`: `npm run configure:hosting -- https://YOUR-ACTUAL-BACKEND-HOST`. Do not replace the localhost target in `vite.config.js`; that proxy is development-only. The command generates a concrete `frontend/vercel.json`; review/commit it. The script requires an HTTPS origin without a trailing slash. Deploy frontend root `frontend` to the chosen frontend host, using Node 24, the Vite build command and `dist` output. Set backend `APP_ORIGIN` to the exact stable deployed frontend origin.
6. Verify `/api` preserves its prefix and goes to Express before SPA fallback, including JSON 404s; API/auth responses are explicitly `no-store`. Verify login, CSRF bootstrap/rotation, Secure/HttpOnly/SameSite=Lax cookie forwarding, unknown APIs, deep-link reload, logout and an agent-to-customer switch **through the real deployed frontend URL**. Local Vite verification cannot prove the hosted proxy works.
7. Configure repository Actions secrets `FRONTDESK_BACKEND_URL` and `JOB_TOKEN`. The committed workflow runs every five minutes and supports manual dispatch; its runner caps work at ten batches and reports errors. Run it once and observe an actual scheduled run. GitHub scheduling/free-host waking can be delayed; write-time timeout enforcement remains authoritative.
8. Confirm data and sessions survive backend restart, verify runtime grants again, and record the actual submission instant plus a retention deadline at least seven days later. Verify provider expiry/quota and cold-start behavior cover this period. Publish the live URL, repo URL and demo credentials only after these checks pass.

The Vercel configuration generator and its test preserve the first-party session topology. No wildcard CORS or cross-site-cookie workaround is used. Explicit no-store controls matter: [Vercel now respects upstream cache headers on external rewrites](https://vercel.com/changelog/vercels-cdn-now-respects-cache-control-headers-from-external-origins-by-default). The backend blueprint follows the [Render specification](https://render.com/docs/blueprint-spec); actual account/tier behavior remains to be verified.

## Behavior and boundaries

Work time is Mon–Fri 09:30–18:30 Asia/Kolkata, excluding frozen per-ticket holidays. Response targets are 2/4.5/9 working hours; resolution targets are HIGH end of effective arrival day, MEDIUM 27 hours, LOW 45 hours. A public question pauses resolution; notes/follow-ups do not reset waiting. Silence closes after 45 working hours, including the exact cutoff. Customer reopening is allowed through 168 elapsed hours after resolution, inclusive, and resumes only the remaining resolution budget. Priority changes preserve consumed work and old breach evidence.

Audit records commit atomically with each command. They prove portal publication and application actions, not email delivery or customer reading. The database owner remains trusted and could replace the database or disable guards; this is not owner-proof tamper resistance. No email, attachment, export, reassignment, registration, analytics or real-time notification subsystem is included.
