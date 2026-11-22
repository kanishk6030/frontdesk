# Phase 2 implementation evidence

Explicit approval: user's Phase 2 master prompt, 2026-11-21. Original business rules remain accepted. This log records execution, not planned success.

Measured work began at 2026-11-21 16:19:43 UTC. Phase 1 duration was not measured and is unknown; it must not be represented as zero.

Verified implementation checkpoint: **2026-11-21 17:28:43 UTC**, a **69-minute elapsed wall-clock span** since the measured start, including tool/approval waits. Final documentation checks follow this checkpoint. No exact per-task labor times were measured. Phase 1 effort is additional and unknown; no eight-hour-total claim is made.

Final documentation/secret checks completed at **2026-11-21 17:30:43 UTC**: **71 minutes measured elapsed time** for this Phase 2 execution span. All 15 required design documents remain substantive, local links resolve, all 24 unique explicit requirements remain traced, and the original implementation plan still totals 480 minutes. Actual local secrets were absent from publishable text files; root/runtime/verification environment files are ignored. No remote repository is configured. No owned verification listener remains on ports 3000, 3001, 5173 or 5555.

## P-01 — environment and compatibility

Docker Desktop initially lacked a reachable engine; its Linux engine became available during startup. System Node was v23.1.0; a workspace-local Node 24 runtime is being installed from the official release with SHA-256 verification. Existing containers and data are preserved.

Local infrastructure uses official postgres:17, a loopback-only port, persistent named volume, and health check. Development and integration tests have separate databases, migration owners, and restricted runtime logins. Production remains hosted PostgreSQL.

Compatibility passed: `prisma validate`, JavaScript `prisma-client-js` generation, `prisma migrate deploy` against development and test databases, PrismaPg client construction and a real query as `frontdesk_runtime`. Exact Prisma CLI/client/adapter pins remain 7.0.0; pg remains 8.16.3. Verified server version: PostgreSQL 17.12.

## Milestone outcomes

| Task | Implemented result | Verification/status |
| --- | --- | --- |
| P-01 | Official Docker service, isolated databases/roles, Node 24, pinned packages and JS Prisma configuration | Passed generation, migrations and real restricted-role connection |
| P-02 | User/ticket/entry/audit/session schema, SQL checks and guards, operator grants, Argon2id/session/CSRF auth | Passed auth, role/privilege and immutable evidence tests |
| P-03 | Pure Luxon calendar, exact millisecond durations and SLA projection | Passed priority, holiday, weekend, closing/equality and snapshot fixtures |
| P-04 | Intake and transaction-scoped row-lock claiming | Two independent PostgreSQL backend PIDs; one winner; loser cannot reply; bounded lock timeout verified |
| P-05 | Separate public/private entries, owner guards and frozen first response | Canary absent from customer API and browser; customer scope and append-only entry checks passed |
| P-06 | Wait/resume, original-budget priority changes and sticky breach evidence | Partial days, repeated pauses, zero/negative allowance and old breach preservation passed |
| P-07 | Public resolution and customer reopening | Remaining-budget resume, terminal restrictions and inclusive reopen cutoff passed |
| P-08 | Bounded maintenance and write-time closure | Late action commits closure/409; concurrent jobs; >100 candidates; ten-batch runner cap and failures passed |
| P-09 | Filtered/paginated queues, audience DTOs, entry/audit cursors | Strict contracts, public-only pagination and bigint-string checks passed |
| P-10 | React login, queue, ticket detail and distinct composers | Browser walkthrough, visible losing-claim conflict and priority changes passed |
| P-11 | Customer create/reply/reopen, history, account-cache isolation and mobile layout | Same-browser agent/customer switch, deep-link reload, screenshots and no page exceptions passed |
| P-12 | Full regression, lint/build, runtime grants, JS-only scan and startup | 36 backend tests and 2 frontend tests passed; browser smoke passed |
| P-13 | README, Render blueprint, Vercel config generator and scheduled workflow | Prepared; live deployment, remote repository and scheduled-provider execution **not run** because account destinations/access are unavailable |
| P-14 | Review fixes, affected retests, evidence and limitations | Local verification complete; pending hosted gates explicitly retained |

The implementation remains within the original 480-minute target; it is not an assertion that exactly eight hours were spent. No extra optional product features were added.

## Executed checks

| Command/check | Actual result |
| --- | --- |
| `docker compose up -d --wait`, `ps`, `logs` | Healthy official postgres:17, PostgreSQL 17.12, loopback-only 5432 |
| Backend Prisma validate/generate/migrate | Passed; JavaScript config and generated runtime; development and isolated test migrations applied |
| `npm test` in backend | **36 passed**, four files: auth 7, calendar 11, integration 17, maintenance runner 1 |
| `npm test` in frontend | **2 passed**, API identity keys and Vercel configuration contract |
| `npm run lint` in both packages | Passed |
| `npm run build` in frontend | Passed, Vite 7.3.8; bundle approximately 291 kB JS / 91 kB gzip |
| `npm run check:stack` | Passed: Node 24, mandated pins, no project-owned TS/TSX/Python/compiler config |
| `npm run db:verify` | Runtime role confirmed; no schema creation, owner membership, evidence rewrite, or ticket delete privileges |
| `npm run test:browser` | Passed in headless local Edge: login/create, actual two-agent claim race and visible 409, private note isolation, wait/reply/resolve/reopen, priority, identity switching, deep-link refresh and mobile render; no browser page exceptions |
| `npm run check:performance` | 2,000 isolated test fixtures; ten warm queue queries including DTOs: min 17 ms, max 19 ms, average 18 ms; not a production load test |
| Isolated production install/generate/prune | Passed using clean ignored directory and locked packages; optional Prisma CLI absent after `--omit=dev --omit=optional`; generated client still queried PostgreSQL successfully |
| Production-mode process `/healthz` on local 3001 | 200; development `/healthz` also 200 |
| Production-cookie proxy simulation | Passed Secure/HttpOnly/SameSite=Lax, no Domain, CSRF and rotation; actual Vercel transport remains unverified |
| `npm run db:studio` | HTTP 200 and actual listener only `127.0.0.1:5555`; restricted URL with read-only sessions; stopped after check |
| Docker `down` then `up -d --wait` | Passed without removing volume; development counts preserved: 11 tickets, 23 entries, 63 events, 6 sessions |
| Replaced Express app/session store | Existing authenticated session remained valid through the same persistent DB |
| Dependency audit | Frontend: zero findings. Backend runtime selection `--omit=dev --omit=optional`: zero findings. Full pinned Prisma toolchain: **14 high** findings retained and disclosed |
| Original assignment PDF | SHA-256 unchanged: `05EC8583CD49B8A5A3D2F3D337E91BCC9FFD09DC28899575C52A5EF7B40E1739` |

Earlier failed checks were corrected and rerun: UI actions could briefly reuse an old version before query refresh completed; the browser test initially matched draft text instead of a committed entry; a priority selector needed an explicit accessible label; a maintenance assertion incorrectly assumed the first 100-row batch included its fixture after performance data accumulated; and PrismaPg exposed timeout codes under its adapter error cause. No failed check is being counted as passed without a successful rerun.

## Acceptance catalog disposition

Local automated/browser evidence covers T-INC0291, T-INC0304, T-INC0318, T-ATOMIC, T-SLA01–T-SLA14, T-LIFECYCLE, T-CLOSE, T-REOPEN, T-JOB, T-AUTH, T-CONTRACT, T-SECURITY, T-QUERY, T-UI and T-JSSTACK. T-PERF is a limited local measurement. T-DEPLOY and T-HANDOFF are **partial**: local and artifact checks passed, but real hosting, repository access, live proxy/cold-start behavior, scheduled execution and review-week retention are **not run**. Do not turn these partial gates into a claim of a completed hosted assignment.

The existing 15 documents and AGENTS.md now record Phase 2 approval and the Docker decision without changing business policy. Source layout is mapped in document 05. Exact setup/release commands are in README; remaining risks are in UNFINISHED.md. Owned temporary application/Studio test processes were stopped after verification; Docker is left healthy with its persistent data.

## Phase 3 local QA — 2026-11-22

The documented setup was replayed with Node 24.22.3 and the healthy PostgreSQL 17.12 container. Development and test migrations reported no pending changes; owner-applied runtime grants and restricted-role verification passed. A stale workspace Vite process had held a native frontend dependency open and stale frontend/backend listeners explained the reported login failure. After stopping only the verified workspace processes, clean install succeeded and the real browser flow authenticated with the current ignored `.env` credentials.

The regression result remained **36/36 backend tests** and **2/2 frontend tests**, with both linters, the JavaScript stack scan, both dependency audits, the production frontend build, and the complete Edge browser walkthrough passing. The walkthrough covered creation, two-agent concurrent claim conflict, public reply, private-note isolation, waiting/customer resume, resolution, eligible reopen, priority change, audit timeline, refresh persistence, role isolation, and mobile layout. Runtime database restrictions were reverified.

Live deployment remains unverified: no Git remote, deployment CLI, hosting token, or authorized account destination was available, and no concrete backend HTTPS URL exists from which to generate `frontend/vercel.json`. `SUBMISSION.md` therefore records a **not submission-ready** verdict until the repository and hosted system are deployed and the critical smoke tests pass through the live frontend origin.
