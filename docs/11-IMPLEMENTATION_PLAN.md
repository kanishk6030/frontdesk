# 11 — Implementation plan and time budget

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Budget and execution rules

The user approved Phase 2 on 2026-11-21. P-01 begins with Node 24, official PostgreSQL 17 Docker health, isolated test database/roles, and an actual pinned Prisma generation/query/migration compatibility check before domain features. This infrastructure adjustment retains the 480-minute target. Measured execution and any overrun belong in document 16.

The proposed implementation budget is **480 minutes / 8 hours** after this documentation package is approved. Record Phase 1 preparation separately and disclose total actual effort; do not suggest the PDF explicitly grants an extra documentation allowance. If eight hours must cover all work, subtract actual preparation time and report the resulting scope risk before Phase 2. No timing has been fabricated in this plan.

Tasks are ordered and small enough to verify independently. Each includes its focused checks; P-12 is integration/regression time, not the first time tests are written. Protect the incident regressions, deterministic SLA rules, and deployment time. Use the reserved buffer only for failures; do not fill it with features.

## Ordered tasks

| Task | Minutes | Dependencies | Concrete work | Acceptance / evidence |
| --- | ---: | --- | --- | --- |
| P-01 | 30 | Explicit Phase 2 approval | Confirm Vercel/Render-or-Railway access and DB-role feasibility; initialize Express JavaScript ES modules and React/Vite JSX; pin approved libraries and verify JavaScript Prisma generation/config; define health/proxy paths | T-JSSTACK setup passes without compiler; skeleton builds; proxy/session feasibility established; no secrets committed |
| P-02 | 55 | P-01 | Prisma user/ticket/entry/audit/session migrations plus custom SQL constraints/triggers/grants; runtime role; JS demo seed; express-session/PostgreSQL store, Argon2id, csrf-sync login/logout; Zod environment/auth schemas | T-AUTH and initial T-INC0318 pass; migrations work from empty PostgreSQL; runtime cannot rewrite evidence |
| P-03 | 45 | P-02 | Pure JavaScript/Luxon calendar functions, snapshots, exact millisecond boundaries and SLA projection; Vitest fixtures | T-SLA01–T-SLA05 and T-SLA14 pass; no clock/holiday logic in React |
| P-04 | 35 | P-02, P-03 | Express/Zod intake and Prisma interactive locked claim service; transaction client passed to helpers; version checks and atomic audit | Supertest/PostgreSQL T-INC0291 passes on independent connections; one owner/event; T-ATOMIC verifies rollback |
| P-05 | 30 | P-04 | Public entries and separate internal notes; owner guards; customer-scoped query/projection; first response completion | Initial T-INC0304, T-SLA06, and message/actor immutability checks pass |
| P-06 | 30 | P-03, P-05 | Wait/resume with public question; checkpoint resolution; priority changes with reasons; sticky breach observations | T-SLA07–T-SLA11 pass; notes/follow-ups do not reset inactivity; no priority allowance reset |
| P-07 | 30 | P-06 | Public resolution; customer-only reopen; seven-day boundary; retained owner and remaining resolution budget | T-REOPEN, T-SLA12/T-SLA13, and relevant T-LIFECYCLE cases pass |
| P-08 | 20 | P-06, P-07 | Maintenance service and authenticated endpoint; due closure and breach recording; mutation-time cutoff enforcement; bounded batches | T-CLOSE/T-JOB core tests pass; no duplicate closure; late rejected message does not roll back due closure |
| P-09 | 20 | P-04, P-05, P-06, P-07, P-08 | Prisma-backed filtered/paginated reads; explicit public/staff builders, strict Zod output contracts and safe BigInt/date serialization | T-QUERY/T-CONTRACT/T-JSSTACK pass; public pagination excludes notes; GET has no mutations |
| P-10 | 40 | P-09 | React JSX/Tailwind login and agent queue/detail; React Router routes; TanStack Query identity-scoped keys/invalidation; separate drafts and 409 handling | Agent T-UI passes; losing claim visible; no cross-audience cache or draft reuse |
| P-11 | 35 | P-05, P-07, P-09, P-10 | Finish React detail/history and customer journeys; Query cache cancellation/clearing on identity change; loading/error/empty states | F-01–F-09 work; public UI/network/cache privacy checks pass |
| P-12 | 50 | P-02 through P-11 | Run Vitest/Supertest/PostgreSQL regressions, lifecycle/boundary/security contracts, JS lint, Prisma validation/generation, Vite build and Node import/start smoke; fix blockers | Mandatory suites including T-JSSTACK pass; no compiler or mocked concurrency substitution |
| P-13 | 40 | P-01, P-08, P-10, P-11, P-12 | Vercel frontend, Render/Railway Express backend, hosted PostgreSQL; verify uncached API proxy/cookies/deep links and scheduled jobs; README and limitations note | T-DEPLOY/T-HANDOFF pass; four submission items ready; owner secret absent from runtime; review-week retention checked |
| P-14 | 20 | P-13 | Reserved correction/retest buffer; final consistency review and actual-time accounting | Fix release blockers only; rerun affected checks; honest finished/unfinished list; no new optional feature |
| **Total** | **480** | | **8 hours** | |

## Useful checkpoints

| Elapsed implementation time | Expected demonstrable result |
| --- | --- |
| 85 minutes, after P-02 | Prisma database, Express session authentication, immutable evidence foundation |
| 165 minutes, after P-04 | JavaScript calendar plus intake and race-safe claim |
| 255 minutes, after P-07 | Replies, private notes, waiting, priority, resolution, and reopening |
| 295 minutes, after P-09 | Complete Express/Zod backend contract and bounded reads |
| 370 minutes, after P-11 | Working browser journeys for both roles |
| 420 minutes, after P-12 | Vitest/Supertest/PostgreSQL regressions and Vite production build pass |
| 460 minutes, after P-13 | Hosted handoff ready; 20-minute correction reserve remains |

Do not wait until the last half-hour to discover missing hosting credentials, unsupported database permissions, or an inaccessible repository. P-01 establishes feasibility; P-13 performs the release with already-working artifacts.

## Dependency and testing strategy

Calendar functions take an explicit time input; tests never sleep for business deadlines. Implement command services before UI controls so the client cannot define its own policy. The same commands serve manual actions and automated closure. Construct DTO allowlists before binding the customer UI.

Write the two-connection claim test alongside P-04 and the unique-note-canary test alongside P-05. Exercise audit privileges during P-02 while deployment choices can still change. Verify a failed audit insert rolls back a message/status change. The complete test catalog and concrete fixtures are in [12 — Test plan](12-TEST_PLAN.md).

## Scope control if time runs short

First cut optional charting, search/export, styling polish, polling refinements, and O-01–O-09 extras. Use simple JSX forms, Tailwind utilities, approved routing/query libraries, established Express middleware and manual refresh. Do not remove user-mandated stack components, replace PostgreSQL locking tests with mocks, disable CSRF/Zod validation, hide leaks in CSS, remove audit constraints, or change the calendar. The revised 480-minute allocation reserves more setup/auth/deployment time; tests are still written alongside each feature.

If a core requirement is incomplete at the time limit, record its R-ID, observable failure, work remaining, and reason in the submission note. A known issue is not “complete” merely because it is disclosed. The three incident protections are release blockers for a completion claim. Do not secretly spend a weekend polishing an “eight-hour” assignment.

## Phase 2 handoff checklist

Read AGENTS.md, business rules, API, schema, and test fixtures before coding. Preserve the approved baseline. Log actual task times and test results. On completion, provide verified hosting/repository links when available, README, and unfinished-work note; do not send messages to the assignment giver unless separately authorized. The user's subsequent Phase 2 prompt authorizes implementation and deployment preparation.
