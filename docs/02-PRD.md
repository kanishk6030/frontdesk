# 02 — Product requirements

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Product objective and roles

Replace an unreliable shared spreadsheet with an agent-facing support application that coordinates ownership, computes fair working-time deadlines, protects team-only information, and explains the history of each ticket (§2). Expected baseline scale is nine agents and roughly forty new tickets per day. No claim of reducing the historical 20% late rate is an acceptance criterion.

Agents operate the shared queue and their assigned tickets. Customers access only their own tickets through the minimal portal. The lead uses agent capabilities. Authenticated system maintenance handles expiry. There is no tenant, supervisor override, public signup, or administrative analytics requirement.

## Explicit requirements and observable acceptance

| ID | PDF source | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| R-01 | §§1, 5, pp. 2, 4 | Working full-stack web application: backend and simple agent screen | Browser can complete intake → claim → reply → resolve against persistent backend data |
| R-02 | §§1, 5, pp. 2, 4 | Approximately eight honest hours | Plan totals 480 implementation minutes; actual time and omissions, including planning time, are disclosed |
| R-03 | §5, p. 4 | Any frontend framework; Node or Python backend; PostgreSQL or MySQL | User-selected React/JavaScript, Node/Express, and PostgreSQL/Prisma; no SQLite substitute for production/tests of locking |
| R-04 | §§1, 5–6 | Host online and provide live URL | Reviewer opens HTTPS application and uses demo accounts |
| R-05 | §5 | Keep online for one week | Retention/expiry checks cover seven days after actual submission; cold-start behavior documented |
| R-06 | §§5–6 | Repository link and README with local run instructions | Fresh-clone setup, database, migrations, seed, startup, and tests are documented and exercised |
| R-07 | §§5–6 | Short note explaining unfinished work and why | Specific omissions and known limitations included; no false completion claims |
| R-08 | §2, p. 2 | Explain late work and retain history beyond current state | Queue identifies breached tickets; history identifies priority, waits, deadlines, actors, and times |
| R-09 | §3, pp. 2–3 | HIGH: response within two hours, fix same working day | Two working-hour response and effective-day closing resolution target, including late/after-hours tests |
| R-10 | §3, p. 3 | MEDIUM: half-day response, about three days to fix | 4.5 / 27 working-hour targets under the approved exact-duration interpretation |
| R-11 | §3, p. 3 | LOW: one-day response, about one-week completion | 9 / 45 working-hour targets |
| R-12 | §3, p. 3 | Work Mon–Fri, 09:30–18:30; no weekends | All SLA and inactivity calculations exclude nonworking intervals; Friday fixtures pass |
| R-13 | §3, p. 3 | Exclude festival holidays | Supplied local holiday dates skip entire workdays; no hard-coded unverified festival calendar |
| R-14 | §3, p. 3 | Customer waiting must not count against agents | Public-question wait pauses resolution; customer reply resumes only remaining time |
| R-15 | §3, p. 3 | Close after about one working week without response | Forty-five working hours of waiting triggers one timeout closure; cutoff and delayed-job cases pass |
| R-16 | §3, p. 3 | Customer may reopen done ticket for about one week, then new ticket | Owning customer can reopen RESOLVED through 168-hour inclusive cutoff; later uses separate creation |
| R-17 | §3, p. 3 | Agents see their tickets on one screen | Mine / Unassigned / All scope filters and readable status, priority, owner, and SLA columns |
| R-18 | §3, p. 3 | Identify already-late and customer-waiting tickets | Breach and waiting filters/badges work together; paused historical breaches remain visible |
| R-19 | §3, p. 3 | Open ticket and reply to customer | Owner publishes plain-text response visible in that customer's portal; first response timestamp is captured |
| R-20 | §3, p. 3 | Write a note for the team only | Dedicated internal-note composer and endpoint; note visible only to authenticated agents |
| R-21 | §3, last paragraph | Decide timer behavior for mid-ticket priority change | Explicit no-reset policy, required reason, immediate-breach cases, and recorded old/new targets |
| R-22 | §4.1, INC-0291, p. 3 | Prevent concurrent taking and conflicting replies | Two independent concurrent claim requests yield one owner/event; losing agent cannot reply |
| R-23 | §4.2, INC-0304, p. 3 | Never disclose internal notes on customer screens, APIs, exports, or lists | Customer allowlist/query tests exclude note content and metadata everywhere; no export endpoint exists |
| R-24 | §4.3, INC-0318, p. 4 | Record exactly what, when, who; prevent later changes | Transactional audit with DB time/actor; messages and history reject update/delete/truncate under runtime credentials |

## Explicit user stack override

The user's FINAL STACK OVERRIDE — JAVASCRIPT fixes these requirements; they are not optional enhancements or alternatives left to the implementing agent. They fit the PDF's permitted stack families.

| ID | Required choice | Acceptance criterion |
| --- | --- | --- |
| U-01 | JavaScript throughout; `.js` and `.jsx`; ES modules on backend | Application/config/test/seed scripts are JavaScript; no TypeScript/TSX source, compiler configuration or compilation step |
| U-02 | React, Vite, JSX, Tailwind CSS, React Router, TanStack Query | Screens use all approved frontend components; identity-scoped cache and explicit routing are verified |
| U-03 | Node.js, Express.js, Zod | Strict runtime request/config/DTO validation and clear JavaScript module boundaries; no static compiler assumption |
| U-04 | PostgreSQL and Prisma ORM | Prisma data access/migrations with custom SQL protections and real transaction tests; JavaScript-compatible client generation |
| U-05 | Vitest, Supertest, PostgreSQL integration tests | `.test.js` suites verify domain rules, HTTP contracts, concurrent claims, privacy and immutable history |
| U-06 | Vercel frontend; Render or Railway backend; hosted PostgreSQL | Independently deployed UI/API, working proxied login/API/deep links, persistent database |
| U-07 | Continue Phase 1 only | Documentation changes only until explicit Phase 2 approval; stack approval is not implementation permission |

## Necessary inferred requirements

| ID | Inference and reason | Acceptance criterion |
| --- | --- | --- |
| I-01 | Authentication and roles are needed to distinguish actors and audiences (R-23/R-24) | Session identity determines permissions; spoofed identity fields rejected; seeded demo logins work |
| I-02 | Durable intake and ownership are needed for a working lifecycle (R-01/R-22) | Customer creates OPEN ticket; unassigned work is discoverable; ownership survives restart |
| I-03 | Explicit states are needed to apply pause/reopen rules (R-14–R-16) | Only the transition matrix is accepted; invalid state commands fail atomically |
| I-04 | Customer view and actions are needed to demonstrate reply and reopening (R-16/R-19/R-23) | Own-ticket list/detail/create/reply/reopen work; cross-customer access is hidden |
| I-05 | Durable automatic processing is needed for timeout closure (R-15) | Scheduled maintenance is authenticated, retry-safe, and catches missed runs; writes enforce cutoffs |
| I-06 | History must be tied to successful mutations (R-24) | Failed audit insert rolls back the business write; rejected commands create no business event except independently due closure |
| I-07 | Public hosting needs bounded, safe requests | Input validation, CSRF, secure sessions, plain-text rendering, bounded lists, and no secret exposure |
| I-08 | Deadline behavior needs reproducible time/calendar inputs | Injected clock in tests, ticket calendar snapshots, and exact boundary cases |

## Nonfunctional baseline

| Area | Selected target / boundary | Verification |
| --- | --- | --- |
| Data correctness | PostgreSQL transactions enforce ownership and mutation/history atomicity | Actual database concurrency and rollback tests |
| Privacy | Customer payloads expose only approved fields; no shared authenticated response cache | Negative API and rendered-page tests |
| Evidence | Append-only entries and audit under runtime DB role; privileged DB owner trusted | Runtime-role DML/TRUNCATE attempts and rollback test |
| Responsiveness | Suggested warm target: queue/detail under 2 seconds for roughly 2,000 tickets and nine agents; not a PDF SLA | Small representative smoke check; cold starts recorded separately |
| Scale restraint | Default 25 tickets/page, max 100; no unbounded list or audit response | API contract tests and SQL query inspection |
| Usability | Keyboard-accessible forms, explicit text labels, empty/error/loading states, readable desktop layout | Focused browser walkthrough; no formal accessibility certification claim |
| Reliability | Persist business data in PostgreSQL; overdue checks independent of browser clocks | Restart and delayed-maintenance tests |
| Time correctness | UTC storage; business timezone/calendar snapshot; no local machine timezone arithmetic | SLA fixtures and host-timezone-independent tests |
| Deployment | HTTPS, production settings, seven-day review availability | Deployment checklist and external browser smoke |
| Maintainability | JavaScript ES modules, strict Zod contracts, one domain service path per mutation, focused tests | Vitest/Supertest contract checks and review against architecture/AGENTS.md in Phase 2 |

These targets are inferred engineering choices, not invented promises in the PDF. No throughput benchmark, multi-region uptime guarantee, real-time push, or enterprise compliance certification is required.

## Release acceptance and exclusions

Release only when all R-01–R-24 are implemented or any actual omission is explicitly named as incomplete, with its failed test and reason. The three incident regressions and correct core SLA/lifecycle rules are release blockers, not discretionary polish. Scope reductions should first remove the O-01–O-09 enhancements in document 14.

The baseline excludes external email/WhatsApp delivery, attachments, exports, reporting charts, supervisor overrides, reassignment, user administration, self-registration, live notifications, calendar editing, and external tamper-proof archival. Their absence does not weaken the privacy boundary: unsupported API/export paths must not accidentally route to a data-bearing fallback.
