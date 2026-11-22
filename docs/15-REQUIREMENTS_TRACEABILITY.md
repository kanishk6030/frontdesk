# 15 — Requirements traceability and Phase 1 validation

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

Primary source: [Hiring Test — Full Stack Developer](../refrence/Hiring%20Test%20-%20Full%20Stack%20Developer.pdf), four printed pages. Page 1 is the title/date; p. 2 contains §§1–2 and the start of §3; p. 3 contains the remainder of §3 and incidents 4.1/4.2; p. 4 contains incident 4.3 and §§5–6. Requirements were extracted from the complete document, not only the incident summaries.

Documents in the tables use their two-digit filename prefix. Plan IDs resolve in [11 — Implementation plan](11-IMPLEMENTATION_PLAN.md); test IDs resolve in [12 — Test plan](12-TEST_PLAN.md). Test ranges are inclusive. See [02 — PRD](02-PRD.md) for acceptance criteria and [14 — Assumptions](14-ASSUMPTIONS.md) for interpretations.

## Explicit PDF coverage

| Requirement | Source / requirement summary | Owning design and selected decision | Plan tasks | Verification |
| --- | --- | --- | --- | --- |
| R-01 | §§1, 5: working backend and agent screen | 01, 02, 05, 07, 08; A-26 | P-01, P-04–P-11, P-13 | T-UI, T-CONTRACT, T-DEPLOY |
| R-02 | §§1, 5: about eight honest hours | 11; A-28; no weekend polish disguised as eight hours | P-01–P-14 | T-TIME, T-HANDOFF |
| R-03 | §5: permitted frontend/backend/database families | 04: React/Vite JavaScript + Node/Express/Zod + PostgreSQL/Prisma; user override fixes these choices | P-01, P-02 | T-JSSTACK, T-DEPLOY, T-HANDOFF |
| R-04 | §§1, 5–6: online live URL | 13: HTTPS web service and managed DB | P-01, P-13 | T-DEPLOY, T-HANDOFF |
| R-05 | §5: keep running for one week | 13; A-27: seven days from actual submission, cold starts disclosed | P-01, P-13 | T-DEPLOY, T-HANDOFF |
| R-06 | §§5–6: repository and local-run README | 13: tested setup/seed/run/test instructions | P-01, P-13 | T-HANDOFF |
| R-07 | §§5–6: short unfinished-work note | 11, 13, 14: concrete omissions/reasons and actual time | P-13, P-14 | T-HANDOFF, T-TIME |
| R-08 | §2: explain late problems; current-state spreadsheet insufficient | 05–08, BR-05/BR-11; A-15/A-30 | P-02–P-09, P-11 | T-INC0318, T-SLA10, T-QUERY, T-UI |
| R-09 | §3, pp. 2–3: severe problem response 2h, same-day fix | BR-02/BR-03; A-05/A-09/A-10 | P-03, P-06, P-09, P-10 | T-SLA01–T-SLA05, T-SLA09 |
| R-10 | §3, p. 3: medium half-day response / about 3 days fix | BR-03; A-06/A-10: 4.5h/27h | P-03, P-09, P-10 | T-SLA01, T-SLA03, T-SLA04 |
| R-11 | §3: small question/request one-day response / about week fix | BR-03; A-06/A-10: 9h/45h | P-03, P-09, P-10 | T-SLA01, T-SLA03 |
| R-12 | §3: 09:30–18:30 Mon–Fri, no weekends, Friday example | BR-02/BR-03; A-05/A-06/A-10/A-14 | P-03 | T-SLA01–T-SLA05 |
| R-13 | §3: no festival holidays | BR-02, 06, 13; A-07: configured dates/snapshots | P-02, P-03, P-13 | T-SLA04, T-SLA14, T-CLOSE |
| R-14 | §3: customer waiting excluded from SLA | BR-06; A-16/A-17: public-question pause, remaining-budget resume | P-05, P-06 | T-SLA06–T-SLA08, T-SLA11, T-SLA13 |
| R-15 | §3: close after about one working week without reply | BR-07; A-18/A-19: 45h cutoff and automatic sweep | P-06, P-08, P-13 | T-CLOSE, T-JOB, T-ATOMIC, T-DEPLOY |
| R-16 | §3: unhappy customer reopens for about week, later new ticket | BR-08; A-20–A-22: 168h window, resume remaining budget | P-04, P-07, P-11 | T-REOPEN, T-SLA12, T-SLA13, T-LIFECYCLE |
| R-17 | §3: agents see their tickets on one screen | 03 F-03, 07 queue, 08 filters | P-09, P-10 | T-QUERY, T-UI |
| R-18 | §3: distinguish late and customer-waiting tickets | BR-05/BR-06, 07, 08; preserved historical breaches | P-06, P-09, P-10 | T-QUERY, T-SLA07, T-SLA10, T-UI |
| R-19 | §3: open and reply to customer | BR-04, 03 F-04, 07, 08; A-11/A-12: authenticated portal | P-05, P-10, P-11 | T-SLA06, T-UI, T-INC0318 |
| R-20 | §3: team-only note | BR-11, 07 separate composer, 08 notes route | P-05, P-10 | T-INC0304, T-SLA06, T-UI |
| R-21 | §3 last paragraph: unresolved mid-ticket urgency rule | BR-09; A-23: original budget less consumed work; no reset | P-06, P-10 | T-SLA09–T-SLA11, T-CONTRACT |
| R-22 | §4.1 INC-0291: simultaneous claiming and conflicting replies | BR-01/BR-12, 05 transaction protocol, 06, 09 | P-04, P-05, P-10, P-12 | T-INC0291, T-ATOMIC, T-LIFECYCLE |
| R-23 | §4.2 INC-0304: no private notes on screens/API/export/list | BR-11, 05 audience boundaries, 07–09; A-29 no export feature | P-05, P-09–P-12 | T-INC0304, T-QUERY, T-CONTRACT, T-SECURITY |
| R-24 | §4.3 INC-0318: exact what/when/who, unchangeable evidence | BR-11, 05/06/09; A-08/A-24: DB time and append-only runtime boundary | P-02, P-04–P-08, P-12, P-13 | T-INC0318, T-ATOMIC, T-DEPLOY |

R-21 explicitly requires resolving a gap; the chosen policy itself is an assumption, not a quote from the PDF. Likewise, the exact thresholds for “about,” timezone, role rules, and states are not falsely labeled explicit.

## Explicit user override coverage

The final JavaScript override and final consistency-fix request supplement the PDF without removing its requirements. Stack approval is separate from Phase 2 authorization. React Router and TanStack Query remain required from the earlier explicit override; the later abbreviated stack list does not revoke them.

| User requirement | Owning design | Plan tasks | Verification |
| --- | --- | --- | --- |
| U-01 JavaScript/JSX, ES modules, no static compiler/configuration | 04, 05, AGENTS.md | P-01, P-12 | T-JSSTACK, T-DOCS |
| U-02 React/Vite/Tailwind/React Router/TanStack Query | 04, 05, 07 | P-01, P-10, P-11 | T-UI, T-JSSTACK |
| U-03 Node/Express/Zod and runtime validation/module boundaries | 04, 05, 08, 09 | P-01–P-09, P-12 | T-CONTRACT, T-SECURITY, T-JSSTACK |
| U-04 PostgreSQL/Prisma and JavaScript-compatible pinned configuration | 04, 06, 13; A-33 | P-01, P-02, P-04, P-12 | T-JSSTACK, T-INC0291, T-INC0318, T-ATOMIC |
| U-05 Vitest/Supertest/PostgreSQL integration tests | 11, 12 | P-02–P-12 | T-INC0291, T-INC0304, T-INC0318, T-SLA01–T-SLA14, T-JSSTACK |
| U-06 Vercel frontend, Render/Railway backend, hosted PostgreSQL | 05, 09, 13; A-27/A-32 | P-01, P-13 | T-DEPLOY, T-HANDOFF |
| U-07 Phase 1 only until explicit Phase 2 approval | 01, 11, AGENTS.md | Phase gate before P-01 | T-DOCS |
| U-08 Phase 2 approved; official PostgreSQL 17 Docker locally, isolated test DB and distinct owner/runtime identities | 04, 06, 12, 13, AGENTS.md | P-01, P-02, P-12 | T-JSSTACK, T-INC0318, T-DEPLOY |

## Inferred mechanics coverage

| Inference | Supports | Design | Plan | Verification |
| --- | --- | --- | --- | --- |
| I-01 Authentication and roles | R-19/R-23/R-24 | 06, 08, 09; A-01/A-02 | P-02, P-10, P-11 | T-AUTH, T-SECURITY |
| I-02 Intake/persistence/ownership | R-01/R-22 | BR-01, 06, 08 | P-02, P-04, P-11 | T-LIFECYCLE, T-INC0291, T-DEPLOY |
| I-03 State machine | R-14–R-16 | BR-10, 08 | P-04–P-08 | T-LIFECYCLE, T-CLOSE, T-REOPEN |
| I-04 Customer-scoped portal/actions | R-16/R-19/R-23 | 03, 07–09; A-01/A-12 | P-05, P-07, P-09, P-11 | T-INC0304, T-AUTH, T-UI |
| I-05 Persistent automatic processing | R-15 | BR-07, 05, 13 | P-08, P-13 | T-JOB, T-CLOSE, T-DEPLOY |
| I-06 Transactional evidence | R-24 | 05, 06, 09 | P-02, P-04–P-08 | T-ATOMIC, T-INC0318 |
| I-07 Safe public hosting | R-04/R-23 | 08, 09, 13 | P-02, P-09, P-12, P-13 | T-SECURITY, T-CONTRACT, T-DEPLOY |
| I-08 Reproducible calendar/clock | R-09–R-16/R-21 | BR-02–BR-09, 06 | P-02, P-03, P-06–P-08 | T-SLA01–T-SLA14, T-CLOSE, T-REOPEN |

Context facts in §2 (nine agents, roughly forty problems/day, historical one-in-five lateness) inform 01/02/05 and T-PERF. They are not invented requirements to build an analytics module or promise a specific future late rate. The cover date and publisher contact information do not require product functionality. All four submission artifacts in §§5–6 are accounted for individually above.

## Architecture sufficiency check

| Required capability | Concrete supporting mechanism |
| --- | --- |
| Concurrent ownership and safe commands | Prisma interactive transaction, parameterized PostgreSQL row lock on the same transaction client, owner/version guards and atomic audit |
| Private notes across all surfaces | Separate endpoints, immutable entry kind, public query filter and explicit DTO allowlist |
| Immutable dispute evidence | Actor/time snapshots, immutable message text, transactional events, runtime role restrictions and triggers |
| Work hours/holidays and exact targets | Frozen calendar snapshot, pure timezone-aware arithmetic, persisted targets |
| Pauses and priority/reopen accounting | Budget/consumed/running checkpoint fields plus before/after event data |
| Silence closure despite restarts | Persistent wait cutoff, external maintenance, mutation-time enforcement |
| Agent and customer journeys | Express/Zod API, React JSX/Tailwind screens, Router and identity-scoped Query cache |
| Hosted evaluation and reproducibility | Vercel frontend and uncached API proxy to Render/Railway; hosted PostgreSQL, pinned JavaScript Prisma setup and verified local-run plan |

No required capability depends on an optional email provider, Redis, WebSocket service, hidden admin operation, or unimplemented customer action. Operational scheduling remains subject to disclosed host/job delay; the cutoff itself is server-enforced.

## Consistency decisions checked

- All documents use HIGH/MEDIUM/LOW and OPEN/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED.
- All use Asia/Kolkata, 09:30–18:30 weekdays, 4.5/9-hour response units, 27/45-hour resolution durations, and literal effective-day HIGH resolution.
- Waiting always requires a public question, pauses only outstanding resolution, and uses a distinct 45-working-hour inactivity timer.
- Auto-close expires at equality; response/resolution at the exact deadline is on time; reopening at its exact 168-hour cutoff is allowed.
- Reopening retains ownership, priority, and remaining resolution budget; completed first response is never reset.
- Priority changes preserve elapsed work and historical breaches; customer silence is not reset by notes, follow-ups, or priority edits.
- Customer payloads never use staff DTOs; no export feature is implied by the export confidentiality boundary.
- Audit and entry immutability is enforced against application/runtime access, with the database-owner limitation disclosed consistently.
- The work plan sums to 480 minutes, includes tests/deployment, and discloses separate Phase 1 effort instead of silently extending the PDF time expectation.
- All active stack instructions use JavaScript, Express, Prisma, Zod and the approved frontend/test libraries. Business time uses millisecond precision consistently; audit IDs use decimal strings. No static compiler or generated application-language exception is permitted.

## Phase 1 validation record

This section preserves the historical documentation checkpoint. Phase 2 implementation/verification now exists; [16 — Implementation evidence](16-IMPLEMENTATION_LOG.md) records actual outcomes for every plan task and test family. R-04/R-05 and the hosted/remote portions of R-06 remain pending hosting/repository access; none is falsely marked delivered by a local build.

The final package contains the 15 numbered documents and root AGENTS.md. Coverage includes 24 explicit PDF requirements, 7 explicit user requirements, 8 inferred requirements, 33 decision-register entries, 14 ordered implementation tasks and 33 named planned test suites. T-DOCS checks local links, table structure, identifiers, substantive content, stale-stack instructions and the 480-minute total. Business policies are preserved; A-31 documents the JavaScript storage/serialization precision change. Prisma compatibility is checked against official documentation and a pinned release; actual package generation and runtime tests were pending at that Phase 1 checkpoint. Current execution evidence appears in document 16. The original PDF hash is unchanged.

Material review risks are A-09/A-10 (HIGH same-day versus Friday language), A-05/A-07 (timezone and real holiday input), A-19/A-27 (free hosting/job timing), A-24 (trusted DB owner), and A-28 (total time accounting). Defaults are fully specified so implementation need not guess; these risks remain visible for approval. O-01–O-09 are deferred enhancements, not necessary hidden dependencies.

**Phase boundary:** Phase 1 is complete. The user explicitly authorized Phase 2 implementation, dependency installation, testing and deployment preparation on 2026-11-21. Sending the submission remains separately authorized.
