# 12 — Test plan

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Test setup and priorities

PostgreSQL integration tests run against the official `postgres:17` Docker service and the dedicated `frontdesk_test` database. They use separate test-owner setup and restricted test-runtime connections. The development database and existing volumes must never be reset for testing. Record actual Docker health, Prisma migration/generation/query results in document 16.

Use Vitest JavaScript test files and Supertest against the exported Express app, with PostgreSQL 17 and Prisma migrations. Pure JavaScript calendar tests receive explicit UTC millisecond instants. HTTP tests use separate Supertest cookie agents and real CSRF bootstrap/login; do not disable middleware for convenience. Integration tests use disposable data and independent committed transactions/connections for races. Do not use SQLite, mocked locks, two sessions on one transaction, or timing sleeps as proof of concurrency.

Use a dedicated test PostgreSQL database with restricted runtime and separate setup-owner identities. Run shared-database integration files sequentially or isolate schemas per worker; concurrency within T-INC0291 deliberately uses at least two connections. Do not wrap that test in one outer rollback transaction. Inject the clock provider through test-only app/service construction; never add an HTTP production time override.

Create Agent A, Agent B, Customer A, Customer B, and a SYSTEM actor without a login. Use a note canary such as `PRIVATE-CANARY-INC0304-ONLY-STAFF`. Default test calendar is Asia/Kolkata, weekdays 1–5, 09:30–18:30, no holidays. Holiday fixtures explicitly label 2026-11-23 or 2026-11-26 as **synthetic**, not actual festivals. All example times below are IST; persistence/JSON must use their equivalent UTC instants.

Tests run before/after the relevant implementation task, with P-12 reserved for complete regression. Required gates are correctness/privacy/evidence/lifecycle, not a code-coverage percentage. Test-database setup and teardown may use an isolated owner; immutability assertions use the runtime role. If rejection triggers interfere with teardown, recreate the disposable test database or use owner-only controlled teardown; never weaken production protections to make the test runner flush succeed.

## Required incident regressions

| ID | Setup and operation | Required assertions | Plan |
| --- | --- | --- | --- |
| T-INC0291 | Create one OPEN unassigned ticket. Synchronize two independent agent claim requests at a barrier so both contend for it; repeat with reversed start order | Exactly one successful initial claim and one 409 ALREADY_CLAIMED; one final owner; exactly one claim event; winning owner can reply, loser gets 403; same-owner retry makes no extra event; transaction/lock actually exercised | P-04, P-12 |
| T-INC0304 | Owner writes canary note among public replies. Read every customer endpoint and render customer views; try staff/detail/audit routes and guessed IDs; request unsupported exports | Canary, note ID/kind/metadata, note counts, staff version/audit absent from entire public payload/DOM/errors. Public pagination/count unchanged by note. Customer B sees none of A's ticket. Customer on agent routes gets 403; unsupported exports 404. Agent sees note; direct customer note creation and visibility override fail | P-05, P-09, P-11, P-12 |
| T-INC0318 | Create, claim, reply at a fixed server time, add note, change priority, wait/resume, resolve/reopen. Attempt audit and entry edits/deletes/truncate via API, ORM, direct SQL as runtime role | Correct actors and authoritative times; original message text retained; old/new values and entry references reconstruct events. All rewrite/delete/truncate attempts fail. Explicit recorded_at supplied on insert is replaced by DB time. Runtime cannot assume owner or disable guards. No UI edit route; original evidence unchanged. DB-owner trust limitation explicitly documented | P-02, P-05, P-12 |
| T-ATOMIC | Inject failure when audit is inserted after proposed ticket/message update; repeat for claim and reply+wait | All requested writes roll back, no orphan entry/partial state; no success returned. Separately, an overdue closure commits even when the late requested action returns 409 | P-04, P-05, P-08, P-12 |

T-INC0291 must verify the losing agent's inability to reply, not only the assignee column. T-INC0304 must inspect API data, not only visible UI. T-INC0318 must test database permissions, not merely the absence of an edit button.

## SLA calculation and boundary fixtures

| ID | Input / operation | Expected result |
| --- | --- | --- |
| T-SLA01 | Create Mon 2026-11-23 09:30, one ticket per priority | HIGH response Mon 11:30, resolution Mon 18:30; MEDIUM response Mon 14:00, resolution Wed 11-25 18:30; LOW response Mon 18:30, resolution Fri 11-27 18:30 |
| T-SLA02 | Arrival Mon 09:29:59, 09:30 exactly, 18:29:59, 18:30 exactly, overnight, Saturday, Sunday | Before opening starts at opening; 09:30 counts; HIGH at 18:29:59 has one second to resolve; 18:30 or later starts next workday; weekend starts Monday; positive work exhausted at closing stays at closing |
| T-SLA03 | Create Fri 2026-11-20 18:00 | HIGH response Mon 11-23 11:00, resolution Fri 18:30; MEDIUM response Mon 13:30, resolution Wed 11-25 18:00; LOW response Mon 18:00, resolution Fri 11-27 18:00. On Sunday MEDIUM/LOW are not late; HIGH resolution already missed is late |
| T-SLA04 | T-SLA03 MEDIUM plus synthetic holiday Mon 11-23; also consecutive holiday/weekend fixtures | Response Tue 11-24 13:30, resolution Thu 11-26 18:00; each whole holiday excluded exactly once; malformed dates rejected and duplicate valid dates normalized to one sorted list |
| T-SLA05 | Action one millisecond before, exactly at, and one millisecond after a due instant; after a Friday-closing deadline; different host/browser timezone | First two meet target, last is late; missed Friday target remains late on weekend; client-supplied time rejected; database clock truncation, Prisma DateTime and UTC serialization agree |
| T-SLA06 | Customer reply and private note before first agent reply; first public wait/resolve reply; later priority changes | Only first owner public reply records response. Note/customer message/claim do not. Completed response time/deadline/outcome never change |
| T-SLA07 | MEDIUM Mon 11-23 09:30; send wait 11:30; customer replies Wed 11-25 10:30 | Two hours consumed, 25 remain; due is Fri 11-27 17:30. While waiting due_at is null and remaining constant; first response satisfied; all weekend/holiday pause overlap handled once |
| T-SLA08 | Waiting from Mon 11-23 11:30; owner adds note and ordinary follow-up; attempts another wait | Auto-close remains Mon 11-30 11:30; paused resolution unchanged. Repeat wait is rejected; a new wait after a genuine customer reply creates a fresh 45-hour window |
| T-SLA09 | LOW Mon 11-23 09:30; change to HIGH Tue 11-24 10:30 | Ten working hours consumed vs original-day nine-hour high budget; immediate resolution breach. No new day from escalation time; unanswered first response recomputed from original creation |
| T-SLA10 | HIGH Mon 09:30; let response/resolution deadlines expire; downgrade to LOW before maintenance has recorded breaches | Old expired targets recorded first; new pending targets may be future, but ever_breached/events remain. A later on-target completion still retains historical miss |
| T-SLA11 | Priority change while WAITING_CUSTOMER; remaining allowance positive, exactly zero, then negative across fixtures | Waiting cutoff never moves; current resolution deadline remains null. Positive allowance waits for resume, zero is due at resume, negative creates immediate breach. No time consumed merely by waiting |
| T-SLA12 | HIGH Mon 11-23 09:30; resolve 12:30; reopen Tue 11-24 10:30 | Three hours consumed, six remain; resumed deadline Tue 16:30; resolved interval excluded; owner/first-response history retained. Exhausted allowance gives immediate deadline, not a reset |
| T-SLA13 | Multiple wait/resume and resolve/reopen cycles, including wait after breach and resolution directly from waiting | Each running segment counted once; no negative consumed duration; previous misses preserved; resolving while paused does not count waiting or create a fictional active deadline; every checkpoint represented in audit |
| T-SLA14 | Change deployment holiday configuration after creating a ticket; create another ticket | Old ticket/reopen retains original snapshot; new ticket uses updated snapshot. No retroactive deadline rewrite; horizon crossing uses supplied dates without annual guesses |

For T-SLA05, an API status of OVERDUE can coexist with zero additional working seconds after a closing-time deadline. Test fixed timestamp comparisons as well as duration arithmetic. For T-SLA09/T-SLA11, breach evidence is observed when a tighter policy is applied, not fabricated at a time before that policy existed.

## Lifecycle, automatic closure, and reopening

| ID | Scenario | Assertions |
| --- | --- | --- |
| T-LIFECYCLE | Parameterize every row of BR-10 across legal actor/status combinations; try all unlisted transitions | Valid transitions update exactly the specified state/owner/clock fields. Invalid combinations return 403/409 without requested mutation. No generic status PATCH, manual close, agent reopen, reassignment, or terminal public reply. Owner notes on terminal tickets are allowed |
| T-CLOSE | Wait Mon 11-23 11:30; process before, exactly at, after Mon 11-30 11:30; repeat with synthetic Thu 11-26 holiday | No close before; close at/after; holiday shifts cutoff to Tue 12-01 11:30. CLOSED reason CUSTOMER_TIMEOUT, resolution CANCELLED not MET; one event; historical breach retained |
| T-CLOSE | Race customer reply and maintenance just before and at cutoff using fixed per-command clock | Accepted before-cutoff reply prevents closure; command processed at cutoff closes/rejects even if request was sent earlier. No inserted late reply and no duplicate closure. Rejected response does not roll back independently due closure |
| T-CLOSE | Delay maintenance until after cutoff; perform GET, then a mutation | GET shows closure_pending and has no writes; mutation commits closure and returns 409; recorded time is late processing time, effective time is cutoff; job retry is no-op |
| T-REOPEN | Resolve Mon 11-23 12:30; reopen just before, exactly at, and after Mon 11-30 12:30 | First two succeed, later gets REOPEN_WINDOW_EXPIRED; seven calendar days include weekends/holidays. Explicit reopen required; ordinary reply gets REOPEN_REQUIRED |
| T-REOPEN | Try customer B, agent, timeout CLOSED ticket; resolve again after successful reopen | Wrong actor denied; CLOSED requires new ticket; subsequent resolution opens new 168-hour window; old episode retained in audit; new ticket has new identity and fresh SLAs |
| T-JOB | Missing/wrong token; session cookie without token; valid job; two concurrent jobs; >100 due candidates; restart/sleep backlog | Only job token authorizes; batch bounded; has_more correct; locks/current-state prevent duplicate events; ten-call runner cap respected; remaining candidates eligible next run; no private payload in counts/errors |

The duplicate T-CLOSE/T-REOPEN rows are cases within those suites, not distinct untracked test IDs.

## API, authentication, and UI checks

| ID | Coverage | Expected evidence |
| --- | --- | --- |
| T-AUTH | Valid/invalid login, role routing, inactive user, session rotation/expiry/logout, cross-customer ID access, spoofed actor fields | Correct 401/403/404; own-only customer reads; no role escalation or client identity override |
| T-CONTRACT | All documented routes, methods, allowlists, required fields, enums, limits, pagination, status/error codes | Contract matches document 08; unknown fields fail; no HTML fallback on unknown APIs; staff expected_version enforced; customer never receives/submits staff version |
| T-SECURITY | Session-bound CSRF on login/all human writes; exact frontend Origin; job-only exemption; secure cookies via Vercel proxy; HTML-looking messages; body/login limits; logging | Correct rejection/escaping; no secret/body logging, wildcard CORS, raw HTML, or blanket CSRF exemption; API rewrite caching disabled; session rotation and fixed expiry verified |
| T-QUERY | Mine/unassigned/all, status/priority/breach combinations, paused historical misses, pagination and equal-time ordering | Filtering precedes pagination; stable ordering; public counts/cursors exclude notes; old misses still discoverable; page size max 100 |
| T-UI | F-01–F-09 in React Router/JSX/Tailwind UI; separate sessions and same-browser agent-to-customer switch; TanStack Query keys/cancellation; load/error/409/network uncertainty | Complete workflows; separate drafts; losing claim safe; no mutation retries; old/in-flight staff cache never appears for customer; timestamps clearly IST |
| T-JSSTACK | Approved packages and exact Prisma pin; JavaScript client generation/import under Node without compiler; strict Zod malformed-field tests; dates/BigInts/DTOs; project source/config scan | Only JS/JSX application/test/config source; no prohibited compiler/runner; Prisma client imports and connects; milliseconds round-trip; audit IDs above Number safe range retain exact decimal strings; unsafe duration conversions and wrong primitive types rejected; DTO failures never emit raw records |
| T-PERF | Representative seed of about 2,000 tickets; warm list/detail with nine-agent-scale use | Observe suggested under-two-second response goal; record actual result; no full-dataset client computation or unbounded entries; not a production load-test claim |

## Deployment and documentation checks

| ID | Coverage | Pass condition |
| --- | --- | --- |
| T-DEPLOY | JavaScript lint, Vitest/Supertest/PostgreSQL tests, Prisma validation/generation, Vite build, Node startup/health; Vercel proxy/deep links/cookie forwarding, production Origin/CSRF, cold start, persistence, grants and job | Both deployments work; unknown APIs return JSON 404; no cache/user leakage; no owner credential in runtime/frontend; data survive restart; scheduled execution observed or honestly marked unverified |
| T-HANDOFF | Fresh-clone README commands, repository access, live link, demo credentials, note, retention dates | All four PDF deliverables accessible; reviewer can run locally; exact omissions disclosed; seven-day availability/expiry check recorded |
| T-TIME | Plan arithmetic and actual work log | Plan sums to 480 minutes; actual Phase 1 and Phase 2 time stated honestly; optional work does not displace core gates |
| T-DOCS | All required files, source coverage, cross-links/IDs, API/schema/rule consistency, nonempty content, phase boundary | Sixteen substantive Markdown files; every R-ID maps to task/test; no conflicting selected policy; no app scaffolding/dependencies/code added in Phase 1 |

## Evidence recording and release gates

In Phase 2 record test command, database version/role, result, and any skipped scenario. Record the concurrent test outcome, representative SLA fixtures, private-canary absence, and runtime mutation-denial results. Do not label tests executed merely because they are written here. The final handoff must distinguish automated results, browser checks, provider assumptions, and unverified limits.

All three incident suites, T-ATOMIC, T-SLA01–T-SLA14, T-LIFECYCLE, T-CLOSE, T-REOPEN, T-JSSTACK and essential auth/privacy/deployment checks are required for a completed baseline. Performance tuning and visual polish may be deferred if the functional/privacy gates pass; an observed failure must still be stated. This remains the acceptance catalog; Phase 2 execution results and unverified hosted checks are recorded separately in document 16.
