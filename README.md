# Frontdesk

A support workspace with one ticket owner, business-hour SLAs, a customer portal, private team notes, and append-only audit evidence.

Implemented with React/Vite/JSX/Tailwind/React Router/TanStack Query, Express ES modules/Zod, PostgreSQL 17 and Prisma 7. No TypeScript application or compilation pipeline. The approved policy is in [Business rules](docs/10-BUSINESS_RULES.md); actual verification and timing are in [Implementation evidence](docs/16-IMPLEMENTATION_LOG.md).

**Status:** application works locally. Vercel/Render configuration and maintenance workflow are prepared. No live deployment or remote repository URL has been verified. See [Unfinished work](UNFINISHED.md) before treating this as a hosted submission.

## Docker Compose setup

The containerized local stack serves the application at **http://localhost:8080**. Nginx is the only service bound to the host; Express and PostgreSQL remain on Compose networks. The production images run Nginx and Node as non-root users, generate Prisma Client during the image build, and keep their filesystems read-only apart from explicit temporary mounts.

Create the ignored root `.env` first (`node backend/scripts/setup-local.js` does this for a new workspace), then run from the repository root:

```powershell
docker compose --profile tools build
docker compose up -d --wait postgres
docker compose --profile tools run --rm db-setup
docker compose up -d --wait backend frontend
docker compose ps
```

`db-setup` is the explicit operator step. It idempotently provisions the separate migration/runtime roles, runs `prisma migrate deploy`, reapplies restricted runtime grants, and seeds demo data without replacing existing tickets or evidence. It receives owner credentials only for that one-shot run. Backend startup never migrates, grants, seeds, runs `db push`, or resets data.

The Docker defaults are `FRONTDESK_HTTP_PORT=8080`, `DOCKER_APP_ORIGIN=http://localhost:8080`, and `DOCKER_NODE_ENV=development`. The development value is intentional for local HTTP cookies. An image deployment behind HTTPS must set `DOCKER_NODE_ENV=production` (or `NODE_ENV=production` in the target platform), set `APP_ORIGIN` to the exact HTTPS frontend origin, and terminate TLS at a trusted ingress.

Useful non-destructive operations:

```powershell
docker compose logs --tail 50 frontend backend postgres
docker compose restart
docker compose down
docker compose up -d --wait
```

`docker compose down` preserves `postgres_data`. Never use `down -v`, `prisma migrate reset`, or `prisma db push` as a setup shortcut. If source or lockfiles change, rebuild with `docker compose --profile tools build` and rerun the explicit `db-setup` step before recreating the services.

## CI/CD and immutable images

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It uses Node 24 and PostgreSQL 17, provisions separate ephemeral owner/runtime roles, executes the real PostgreSQL backend suite, validates/generates Prisma, runs both linters and frontend tests/build, and builds both linux/amd64 runtime images. A failure in any required job blocks the image-publishing job.

Successful trusted pushes to `main` publish:

```text
ghcr.io/<owner>/<repository>-backend:sha-<40-character-commit>
ghcr.io/<owner>/<repository>-frontend:sha-<40-character-commit>
```

The workflow records each registry-provided `sha256` digest in its summary and a retained artifact. Pull requests have read-only permissions and never authenticate for publishing. `latest` is deliberately not published.

Manual release uses `.github/workflows/release.yml`. Supply a previously published `sha-<commit>` version, component, target GitHub Environment, and provider. The workflow resolves the tag to its immutable digest and never rebuilds it. A backend release checks out that exact commit and, using Environment secrets, runs only `prisma migrate deploy`, restricted grants, and the runtime privilege verification before invoking the provider adapter. It never seeds, resets, or uses `db push`.

Create GitHub Environments named `staging` and `production`. Configure required reviewers and prevent self-review for `production`. Each environment needs:

- Secrets: `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `RENDER_API_KEY`, `RENDER_BACKEND_DEPLOY_HOOK_URL`, and `RENDER_BACKEND_SERVICE_ID`.
- Variables: `BACKEND_HEALTH_URL`, including the `/healthz` path.
- The backend Render service must be image-backed, have GHCR pull credentials if the package is private, retain its restricted runtime environment, disable automatic deploys, and accept the backend image name above. The existing `render.yaml` describes the earlier source-built option and is not the digest-release adapter.

The initial Render adapter intentionally releases only the backend image. The Docker frontend image uses the Compose-only `backend:3000` upstream and must not be deployed as a standalone Render service. Deploy the Vite frontend to Vercel through the separately reviewed manual process; a future VPS/Railway adapter can define its own image topology without changing CI image identity.

Rollback is another manual release using a previously recorded `sha-<commit>` whose digest still exists in GHCR. Migrations are forward-only: confirm the older application image is compatible with the already-applied schema. Never attempt rollback by resetting the database or deleting evidence.

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

### One-time production PostgreSQL provisioning

Local and production setup share `backend/scripts/provision-local.js`, but use separate explicit modes:

- `npm run db:provision` keeps the existing local/Docker behavior. It may create the local databases and must never receive a production URL.
- `npm run db:provision:production -- --preflight|--apply` loads the gitignored root `.env.production`, uses the existing managed database, and never creates, drops, renames, resets, or changes ownership of that database.

For the existing Render database, first create the private file from the safe template:

```powershell
Copy-Item .env.production.example .env.production
```

Edit `.env.production` so all three URLs point to the same `frontdesk_q7b9` database and include `sslmode=require`:

```text
ADMIN_DATABASE_URL       existing frontdesk_admin connection
MIGRATION_DATABASE_URL   new frontdesk_migration username and independent 24+ character password
DATABASE_URL             new frontdesk_runtime username and independent 24+ character password
```

With Node.js 24, run the read-only preflight from `backend`:

```powershell
npm ci
npm run db:provision:production -- --preflight
```

Review the reported database identity, administrator capability, schema permissions, roles, and existing-object ownership. If every check passes, apply once:

```powershell
npm run db:provision:production -- --apply
```

The apply mode is idempotent. It creates or hardens separate unprivileged migration/runtime roles, grants the migration role schema-creation permission, and ensures runtime cannot create schema objects. It does not migrate or seed. Store `MIGRATION_DATABASE_URL` and `DATABASE_URL` as protected GitHub Environment secrets; store only `DATABASE_URL` in the backend service. Never give the web service `ADMIN_DATABASE_URL` or `MIGRATION_DATABASE_URL`.

If an earlier production apply stopped with `permission denied to change default privileges` (`42501`), update to the fixed script and rerun `--preflight`, then `--apply`. Do not change database ownership or manually grant the administrator membership in the migration role. The script now connects as the migration role to configure that role's own default privileges. The earlier administrator transaction was rolled back on failure; if managed PostgreSQL retained any independently committed role state, the preflight checks it and the idempotent apply safely reconciles it. Stop if preflight reports privileged roles, unexpected memberships, or wrong object owners.

The existing manual release workflow then uses `MIGRATION_DATABASE_URL` for `prisma migrate deploy`, reuses `grant-runtime.js`, verifies restrictions with `verify-database.js`, and deploys only after those checks pass. After secrets are stored, remove the private operator file if it is no longer needed:

```powershell
Remove-Item -LiteralPath ..\.env.production
```

1. Push this repository to your authorized Git host and record its URL. No remote has been configured here.
2. Provision hosted PostgreSQL 17 with the production mode above. The initial managed connection is privileged and must never become the backend `DATABASE_URL`. Keep TLS required.
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
