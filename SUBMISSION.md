# Frontdesk submission

## Submission links

- Live application: **Not available / not verified.** Local QA passed, but no authorized Vercel or Render/Railway account was available during the audit.
- Repository: **Not available.** The local Git repository has no configured remote.

These two items must be supplied and the deployed application must pass the critical smoke tests before this project is described as submission-ready.

## Local setup

Follow [README.md](README.md). In summary:

1. Copy `.env.example` to `.env` and replace every placeholder secret before first provisioning.
2. Start Docker Desktop and run `docker compose up -d postgres`.
3. In `backend`, run `npm ci`, `npm run db:provision`, `npm run prisma:validate`, `npm run prisma:generate`, `npm run prisma:migrate:deploy`, `npm run db:grants:runtime`, and `npm run db:seed`.
4. In `frontend`, run `npm ci`.
5. Start the backend with `npm run dev` and the frontend with `npm run dev` in separate terminals.
6. Sign in with the demo usernames and passwords configured in the root `.env`; `.env.example` values are placeholders, not credentials.

Stop any existing Frontdesk development processes before running `npm ci`. A running Vite process can hold a native dependency open on Windows and cause an `EPERM` installation error.

## Completed features

- Session authentication, CSRF protection, role authorization, and agent/customer isolation
- Agent queues, filtering, ticket detail, atomic claiming, public replies, and private notes
- Customer ticket creation, ticket list/detail, replies, and reopen flow
- Working-calendar SLA deadlines, waiting pauses, priority history, automatic closure, and reopen eligibility
- Append-only audit history protected by database permissions and triggers
- Idempotent maintenance endpoints and an external scheduler workflow
- PostgreSQL-backed integration tests and a production frontend build

## Not completed or not verified

- Live Vercel and Render/Railway deployment: credentials and account authorization were unavailable.
- Hosted PostgreSQL provisioning, migrations, runtime grants, secure-cookie behavior, CORS, and scheduled maintenance have not been exercised in a production environment.
- Live frontend-to-backend routing has not been verified because no backend URL exists yet.
- Repository publication has not been performed because no remote is configured.

## Tests actually executed

- Backend: `npm test` — **36/36 passed** across 4 files against PostgreSQL.
- Backend: `npm run lint` — **passed**.
- Backend: `npm run check:stack` — **passed** (JavaScript-only mandatory stack and pinned versions).
- Backend: `npm audit --omit=dev --omit=optional` — **0 vulnerabilities**.
- Frontend: `npm test` — **2/2 passed** across 2 files.
- Frontend: `npm run lint` — **passed**.
- Frontend: `npm run build` — **passed** (84 modules transformed).
- Frontend: `npm audit` — **0 vulnerabilities**.
- Browser: `npm run test:browser` — **passed** in Edge, including login, creation, concurrent claim conflict, public reply, private note isolation, waiting/customer resume, resolution, reopen, priority change, audit timeline, refresh persistence, role isolation, and mobile layout.
- Database verification — **passed** as `frontdesk_runtime`: no schema creation, owner-role membership, audit rewrite, or ticket deletion privileges.

The suite explicitly covers INC-0291, INC-0304, INC-0318, SLA calendar boundaries, waiting pause/resume, priority history, 45-working-hour closure, reopen eligibility, authentication, and authorization.

## Known deployment limitations

Deployment remains **NOT TESTED**. The target operator must provide hosted PostgreSQL credentials, configure separate migration and runtime roles, deploy migrations and runtime grants with the migration role, create the frontend deployment configuration using the real backend URL, configure secure production origins/cookies, and authorize the scheduled maintenance caller. No secrets should be committed.

## Readiness verdict

**Not submission-ready yet.** The critical local incidents and essential workflows are verified, but the required repository and live deployment are absent and therefore cannot be tested.
