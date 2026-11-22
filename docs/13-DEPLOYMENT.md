# 13 — Deployment and handoff runbook

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Hosting topology

Phase 2 local infrastructure is root Docker Compose using official `postgres:17`, bound to `127.0.0.1:5432`, a persistent volume, and `pg_isready` health. `docker compose up -d --wait`, `docker compose ps`, `docker compose logs postgres`, and `docker compose down` manage it; never use `down -v` without explicit data-deletion approval. Provision distinct owner/runtime users for development and a separate test database before migrations. The initial image administrator is not an application identity. Exact verified setup commands are maintained in the root README during implementation.

Deploy the Vite/React frontend on **Vercel**, the Node/Express backend on **Render** (or the user-approved **Railway** alternative), and use **hosted PostgreSQL**. Render plus PostgreSQL in the same region is the default proposal. Vercel hosts static browser assets; backend business logic, Prisma, secrets, sessions and maintenance stay on the backend host.

The browser uses relative `/api` URLs. A Vercel external rewrite forwards `/api/:path*` to the same `/api/:path*` path on the configured backend. That rule precedes the React Router history fallback; unknown API paths must return the backend's JSON 404 rather than `index.html`. Disable external rewrite caching for this API prefix and set no-store response headers. Verify headers and Set-Cookie propagation on the actual deployment. [Vercel rewrites](https://vercel.com/docs/rewrites).

This provides a first-party browser session while retaining the required separate deployments. Cookies omit Domain, use Secure/HttpOnly/SameSite=Lax, and are associated with the Vercel frontend host. Backend APP_ORIGIN is the exact frontend origin used for CSRF validation. No direct cross-site cookie/CORS fallback is planned. Local Vite uses the corresponding `/api` proxy to Express.

Use a managed Node process on Render/Railway with `node src/server.js`. Backend setup installs pinned dependencies and generates the JavaScript Prisma client; there is no application compilation or frontend asset collection into the backend. Vercel independently builds `frontend/dist`. A container is optional, not a prerequisite in this eight-hour plan.

## Availability and provider risks

Check current account limits, permitted regions/versions, database role-management capability, expiry and quota headroom before implementation depends on a provider. Prefer the backend host's internal DB connection; authorized operator migrations may need a TLS external connection. PostgreSQL 17 remains the baseline. [Render PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting).

Render's free service can sleep and its free database has a finite lifetime. The API proxy may time out during a backend cold start; validate this from the Vercel URL rather than only curling the backend. Railway availability, pricing and trial terms must be checked if selected; do not incur charges without authorization. [Render free-service limits](https://render.com/docs/free), [Railway deployment documentation](https://docs.railway.com/guides/deploy).

Keep frontend, API, database, scheduler and reviewer accounts usable for seven days after actual submission. Record that retention-until instant and check provider expiry covers it with margin. The proposed interpretation permits disclosed cold starts; a strict always-running requirement needs a suitable authorized host/tier. Deadline arithmetic never depends on process uptime.

## Configuration and secret boundaries

| Variable / configuration | Consumer | Required meaning |
| --- | --- | --- |
| `DATABASE_URL` | Backend runtime and its session store | Restricted PostgreSQL runtime user; never owner |
| `MIGRATION_DATABASE_URL` | Operator migration/seed environment only | Owner connection; absent from backend runtime and Vercel |
| `SHADOW_DATABASE_URL` | Local migration development only, if needed | Disposable shadow DB with owner access; never production runtime |
| `SESSION_SECRET` | Backend | High-entropy random signing secret, stable across restarts |
| `NODE_ENV` | Backend | production when hosted |
| `TZ` | Backend/operator Node process | UTC for infrastructure timestamp handling; SLA code still uses explicit Asia/Kolkata |
| `APP_ORIGIN` | Backend | Exact HTTPS frontend origin; localhost Vite origin only in local development |
| `TRUST_PROXY_HOPS` | Backend | Start at one managed immediate proxy hop; verify hosting protocol forwarding and ingress restrictions |
| `JOB_TOKEN` | Backend and scheduler secret store | High-entropy maintenance-only bearer token |
| `FRONTDESK_HOLIDAYS` | Backend | JSON local-date list, normalized/validated; empty demo list disclosed |
| `DEMO_AGENT_PASSWORD`, `DEMO_CUSTOMER_PASSWORD` | Operator seed invocation only | Demo-only credentials; no public config values |
| `PORT` | Backend | Provider-assigned listening port |
| `FRONTDESK_BACKEND_URL` | Scheduler configuration / deployment records | Actual backend HTTPS origin for direct maintenance calls |
| Vercel rewrite destination | Reviewed frontend hosting configuration | Actual backend origin with preserved `/api` prefix; contains no credential |
| `VITE_API_BASE` | Optional frontend public config | `/api` only; relative default; never a database URL or secret |
| `TEST_DATABASE_URL`, `TEST_DATABASE_OWNER_URL` | Local/test CI only | Disposable test database runtime and owner identities, never production data |

Zod validates an allowlisted configuration object at startup; unrelated system environment variables are not application inputs. Fail startup on invalid required values. Prisma's JavaScript CLI config can select MIGRATION_DATABASE_URL when an operator supplies it, otherwise DATABASE_URL for generation; generated-client setup must not require an owner credential in hosting. The server itself uses only DATABASE_URL and must not receive the migration secret.

Do not create TypeScript-specific configuration, a compiler step, or a TypeScript runner. `prisma.config.js`, `vite.config.js` and `vitest.config.js` are JavaScript ES modules. Pin matching Prisma CLI/client/adapter packages and the `prisma-client-js` generator before release; its documented deprecation is an upgrade risk, not permission to alter the language requirement.

## Database and migration sequence

1. Provision the selected PostgreSQL database and distinct migration-owner/runtime principals. Verify the runtime principal cannot assume owner.
2. In development, define `schema.prisma`, generate a reviewed migration, and add custom SQL for checks, indexes, session storage, grants, and append-only/audit timestamp triggers. Creating the migration is a Phase 2 task.
3. Use operator credentials for Prisma Migrate development/shadow operations and release migration application. The hosted runtime never runs migrate/reset/db push/seed on startup.
4. Apply migrations to an empty test database and the intended hosted database using the reviewed owner-run procedure. Check database identity before any mutation. Use `prisma migrate deploy` for release, not `db push`.
5. Seed demo users and optional synthetic tickets once with the JavaScript seed script. Mark synthetic subjects `[DEMO]` and audit data `fixture=true`; do not expose a clock override through HTTP.
6. Verify restricted-role login/ticket writes and direct denial of entry/audit UPDATE/DELETE/TRUNCATE. Check custom SQL survived migration generation; Prisma schema validation alone is insufficient.

The session table is created by migration, not by connect-pg-simple on first request. Give the session store only required runtime permissions and a bounded pool. App/Prisma and session pools together must fit the provider connection limit. If the provider cannot support this role separation, resolve it in P-01 before a completion claim depends on immutable history.

## Build and release sequence

1. P-01 establishes Vercel/backend/repository access, npm/Node compatibility, JavaScript Prisma generation, and the proxy/cookie feasibility. Pin lockfiles independently for frontend and backend.
2. Run JavaScript lint, Vitest/Supertest tests with real PostgreSQL, Prisma validation/generation, and the Vite production build. Verify no project-owned forbidden source/config files or compiler scripts.
3. Apply owner-run release migrations and one-time seed using an authorized operator environment. Keep that credential out of both service configurations.
4. Deploy backend root `backend`: install from lockfile, generate the JavaScript client, then run the production start script. Use backend `/healthz` for readiness. No database data on ephemeral local disk.
5. After any authorized backend host provides the real HTTPS backend origin, run `npm run configure:hosting -- https://YOUR-ACTUAL-BACKEND-HOST` from `frontend`. Keep `vite.config.js` pointed at local port 3000 because it is development-only. Deploy frontend root `frontend`: build the Vite app to `dist`, configure the uncached API rewrite first and client-route fallback afterward, and apply frontend security headers. Set backend `APP_ORIGIN` to this exact stable deployed frontend URL.
6. From a fresh browser on the deployed frontend host, test CSRF bootstrap, login/session rotation, role routing, deep links, claim/reply/wait/resolve/reopen, logout, and a different-user login. Inspect cookies, response schemas, cache isolation and unsupported API errors.
7. Enable maintenance, run it manually, then observe a scheduled run. Reboot/redeploy the backend and confirm sessions/tickets/entries/history survive. Exercise a cold start through the frontend proxy and record any timeout behavior.
8. Record the live frontend URL, backend health target, accessible repository, actual submission time and seven-day retention deadline. Prepare the README and truthful limitations note.

The subsequent Phase 2 prompt authorizes implementation and deployment preparation. Reviewable artifacts now exist in `render.yaml`, the frontend hosting configuration generator, and the maintenance workflow. Actual hosted checks remain pending access; sending the submission is still not authorized.

## Maintenance workflow

Schedule GitHub Actions every five minutes, preferably offset from the top of the hour, with manual dispatch available. Send POST to the backend's `/api/internal/maintenance` using the job token in Authorization and an empty JSON body; use a bounded timeout that tolerates backend wake-up. Do not route the job through the frontend or log secret headers. Follow has_more for at most ten calls, report nonzero errors, and retry failed batches on later runs.

Scheduled workflows run from the default branch and may be delayed or disabled after inactivity. Observe actual run records rather than treating a cron expression as proof of execution. [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

The sweep persists due closures/breach observations. Ticket writes independently enforce the timeout cutoff under lock; reads may show closure pending but never mutate. A backend outage delays processing without changing the effective cutoff. Audit stores actual recorded time separately.

## Planned local-run and verification contract

The root README contains implemented and locally verified PowerShell procedures. The table below remains the design-level command contract; document 16 records actual results. Production builds generate Prisma Client and then run `npm prune --omit=dev --omit=optional` so the optional Prisma CLI peer is not shipped. Hosted release checks remain unverified.

| Step | Intended instruction |
| --- | --- |
| Prerequisites | Node.js 24 LTS, npm, PostgreSQL 17, repository access |
| Install | `npm ci` in frontend and backend against their committed lockfiles |
| Configuration | Supply local runtime/operator DB URLs, session secret and local Vite APP_ORIGIN; no committed secret values |
| Client/schema | Backend scripts `npm run prisma:generate` and `npm run prisma:validate`, using JavaScript config and the selected generator |
| Migration | Operator runs backend `npm run db:migrate:deploy`; local authoring uses reviewed `db:migrate:dev` and a disposable shadow database |
| Seed | Operator runs backend `npm run db:seed`, invoking `node scripts/seed-demo.js` once |
| Development | Backend `npm run dev` invokes Node watch on `src/server.js`; frontend `npm run dev` starts Vite with the `/api` proxy |
| Tests | Backend `npm test` / `npm run test:integration` invoke Vitest and Supertest against test PostgreSQL; frontend test script runs its focused Vitest checks |
| Quality/build | `npm run lint` in both packages; `npm run build` in frontend; backend JavaScript import/start smoke |
| Maintenance | Backend `npm run maintenance` invokes `node scripts/run-maintenance.js` with restricted runtime access |
| Hosted start | Backend `npm start` invokes `node src/server.js`; frontend serves the Vite build from Vercel |

No tsc/typecheck command, language-specific compiler config, or backend compilation is part of this contract. The README must explain PostgreSQL runtime/owner test identities and disposable DB cleanup without weakening production audit protections.

## Failure handling and handoff

Health failures return safe errors; inspect redacted backend/DB logs. Roll back to a schema-compatible known-good deployment or use a reviewed forward migration; never repair a release by deleting reviewer data/history. If scheduled runs are missing, inspect the workflow and invoke the authenticated maintenance path with actual processing times preserved.

The four PDF submission items remain: live frontend URL, repository link, local-run README, and a short unfinished-work note. The note names actual omissions, portal-only delivery, calendar assumptions, trusted DB-owner boundary, proxy/cold-start/scheduler limits, JavaScript client compatibility choice, and honest time accounting as applicable. Provide demo credentials without publishing infrastructure secrets. Keep both deployments and the database available through the review period.

T-DEPLOY/T-HANDOFF in [12 — Test plan](12-TEST_PLAN.md) define evidence. No fabricated live/repository link or claim of executed deployment is appropriate during Phase 1. Sending the submission to another person still requires separate user authorization.
