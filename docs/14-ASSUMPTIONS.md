# 14 — Assumptions, decisions, and scope risks

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

Source: [assignment PDF](../refrence/Hiring%20Test%20-%20Full%20Stack%20Developer.pdf). All four printed pages were read, including §§3–4. The requested `reference/` path does not exist; the actual directory is `refrence/`. Preserve that file and spelling unless separately asked to rename it. SHA-256: `05EC8583CD49B8A5A3D2F3D337E91BCC9FFD09DC28899575C52A5EF7B40E1739`.

## Classification

Subsequent explicit decision U-08: Phase 2 is approved and official `postgres:17` Docker Compose is mandatory locally, with a persistent volume, loopback binding and isolated integration database. Production remains hosted PostgreSQL. This supersedes the historical pending-approval entries below; business interpretations are unchanged.

- **Explicit (E):** a demand or fact stated in the PDF. Requirement IDs `R-01`–`R-24` in [15 — Traceability](15-REQUIREMENTS_TRACEABILITY.md) capture these.
- **User override (U):** U-01–U-07 fix JavaScript, frontend/backend/database/testing/deployment choices, and the continued Phase 1 gate. They take precedence over prior technology proposals. A-26's existing ID is retained for traceability but records that explicit decision.
- **Inferred (I):** necessary mechanics such as authenticated identities, ticket intake, persistent ownership, and customer-scoped reads. `I-01`–`I-08` are tracked separately.
- **Assumption (A):** one selected answer where the story is incomplete. The decisions below are authoritative together with [10 — Business rules](10-BUSINESS_RULES.md).
- **Optional (O):** additions not needed for the evaluated baseline. They are listed below and are not disguised as unfinished explicit requirements.

## Decision register

| ID | Gap and PDF context | Selected interpretation | Justification and trade-off |
| --- | --- | --- | --- |
| A-01 | Customer interface/authentication unspecified (§3; §4.2) | Seeded, session-authenticated agent and customer accounts; small customer portal | Makes reply, reopen, and confidentiality demonstrable; costs a small extra screen |
| A-02 | Lead powers / customer organizations unspecified (§2) | Lead is a normal agent; one service team; customer owns their individual tickets | Avoids an admin permission hierarchy and tenant model |
| A-03 | Intake and priority chooser unspecified (§3) | Customer creates a ticket, chooses HIGH/MEDIUM/LOW; default MEDIUM | Provides complete journeys; priority may be corrected by owner; no agent intake form |
| A-04 | Assignment lifecycle unspecified (§4.1) | Claim once; retain owner; only owner writes; no release/reassignment | Prevents conflicting replies, but cannot transfer work if an agent is absent |
| A-05 | Timezone unspecified (§3) | Asia/Kolkata; UTC persistence | Plausible from assignment/company context, explicitly not a PDF fact |
| A-06 | Half-day/day/week and breaks unspecified (§3) | 4.5 / 9 / 45 working hours; no lunch break | Matches the stated nine-hour workday without inventing breaks |
| A-07 | Holiday list and edits unspecified (§3) | Configured local dates captured in an immutable per-ticket calendar snapshot | Reproducible history; new calendar changes do not fix existing ticket dates automatically |
| A-08 | Timestamp authority unspecified (§4.3) | Database time after locking; server processing determines acceptance | Resists client time manipulation; a request queued past a cutoff can be rejected |
| A-09 | “Same working day” versus rolling duration (§3) | HIGH resolution ends at 18:30 of effective creation day | Literal interpretation; very short allowance near closing |
| A-10 | “About” three days / week and Friday example (§3) | Exact 27/45-hour targets; Friday example forbids weekend accumulation but not an already-missed HIGH deadline | Deterministic; material tension remains with a universal reading of “not late Sunday” |
| A-11 | What constitutes a response (§3; §4.3) | First committed public reply by owner, including wait/resolve reply | A claim or private note cannot satisfy a promise to a customer |
| A-12 | Delivery channel unspecified (§3; §4.3) | Publish to authenticated portal; no email/WhatsApp integration | End-to-end, testable response; does not prove external delivery or reading |
| A-13 | SLA on reopened tickets unspecified (§3) | One first-response SLA per ticket, frozen after response | Avoids rewriting response evidence; no subsequent-response SLA |
| A-14 | Deadline equality unspecified (§3) | Completion at due instant is on time; pending is late strictly after due | Clear boundary; a missed closing-time deadline remains late overnight |
| A-15 | Historical breach handling unspecified (§2; §4.3) | Breach evidence is sticky even if a new target is later | Preserves accountability; UI must distinguish historical and current breaches |
| A-16 | How waiting starts (§3) | Owner sends a public question and enters WAITING_CUSTOMER atomically | Avoids pausing without actually asking the customer; first-response clock cannot be paused |
| A-17 | Repeated follow-ups and waiting (§3) | Notes/follow-ups do not reset inactivity; only customer reply resumes | Prevents keeping silent tickets alive by repeated agent messages |
| A-18 | “About one working week” of silence (§3) | Auto-close at 45 working hours, with equality expired | Predictable and holiday-aware; no grace period |
| A-19 | Automatic-job delivery unspecified (§3; §5) | Five-minute external maintenance trigger, plus mutation-time enforcement; disclose delays | Works with sleeping free hosting; no hard real-time closure guarantee |
| A-20 | Reopen “about one week” (§3) | Seven elapsed calendar days after latest resolution; inclusive boundary | Text distinguishes working week for inactivity, not for reopening |
| A-21 | Resolution budget after reopen (§3) | Resume remaining original budget, exclude resolved interval; retain owner | Discourages timer resets by premature resolution; may reopen already breached |
| A-22 | Does “contact again later” reopen timeout tickets? (§3) | Timeout CLOSED is terminal; create new ticket; RESOLVED can reopen within window | Separates unanswered requests from disputed fixes |
| A-23 | Priority change explicitly unanswered (§3) | Recalculate pending targets from original creation/budget minus consumed work; no reset; required reason | Tightening can breach immediately; downgrading does not erase history |
| A-24 | “Nobody” may change history (§4.3) | Append-only database permissions and triggers, no application edit/delete; DB owner remains trusted | Defensible 8-hour boundary; not absolute resistance to a malicious infrastructure owner |
| A-25 | Stale screens / retries unspecified (§4.1) | Staff optimistic version plus DB lock; customers use locked state validation without exposing staff version | Prevents stale agent commands; arbitrary message retry deduplication is deferred |
| A-26 | Stack now fixed by user's final override within §5 allowances | React/Vite/JSX/Tailwind/React Router/TanStack Query; Node/Express JS ES modules/Zod; PostgreSQL/Prisma; Vitest/Supertest | Explicit approved stack, not an implementer's optional choice; runtime schemas/tests replace static compilation |
| A-27 | Hosting fixed by user; availability mechanics remain (§5) | Vercel frontend, Render backend by default or Railway alternative, hosted PostgreSQL; GitHub Actions maintenance | Separate deployments require verified proxy/cookie handling; keep all components available seven days |
| A-28 | “About 8 hours” accounting (§§1, 5) | Proposed implementation budget is 480 minutes after documentation approval; record Phase 1 time separately | The PDF's overall time expectation may include planning; report all actual time honestly, never hide it |
| A-29 | Exports mentioned only as a confidentiality boundary (§4.2) | No export capability in baseline; unknown export URLs return JSON 404 | Avoids inventing an export feature; any future export must use the public allowlist |
| A-30 | Reporting needs (§2; §3) | Queue breach filters plus ticket history explain lateness; no aggregate analytics | Meets the operational need at current scale; no managerial BI dashboard |
| A-31 | JavaScript/Prisma clock and JSON representations | Millisecond database time/timestamptz(3); exact integer millisecond counters; UUID users; audit BigInts as decimal JSON strings | Avoids silent Date precision loss and unsafe Number/BigInt serialization; boundary tests use one millisecond |
| A-32 | Session transport across Vercel and backend hosts | Uncached Vercel `/api` rewrite; host-only first-party cookie; PostgreSQL sessions and synchronizer CSRF token; exact frontend Origin | Keeps browser auth coherent without cross-site cookie dependence; proxy/cache behavior must be verified |
| A-33 | Prisma generator/config defaults can conflict with JavaScript-only rule | Exact prisma/client/adapter 7.0.0, pg 8.16.3, prisma-client-js with client engine, PrismaPg adapter, prisma.config.js | Documented JavaScript runtime path; generator is deprecated; Phase 2 generation/import/connection checks passed; upgrades still need review |

## Inputs still needed for deployment, not for business-rule implementation

| Input / risk | Default or action | When it matters |
| --- | --- | --- |
| Phase 2 authorization | Explicitly approved in the user's 2026-11-21 master implementation prompt | Gate satisfied; implementation and verification proceed |
| Actual Arvo holiday dates | Empty demo list clearly labeled; fixture-only holidays for tests; collect approved dates before real usage | Before realistic demo deadlines are represented as Arvo policy |
| Repository and hosting access | Prepare reviewed artifacts in Phase 2, then use available account access; never embed secrets in docs | Deployment tasks P-01/P-13 |
| Reviewer login details | Generate separate seeded identities; supply demo-only credentials securely in handoff | Online verification |
| Calendar timezone / high-priority interpretation | Use A-05/A-09 unless user revises this baseline | Phase 1 review; high effect on expected deadlines |
| Provider limits | Verify selected tiers, DB role management, expiry beyond review window, cron enablement, and cold-start behavior | P-01 feasibility check; P-13 release |
| JavaScript Prisma compatibility | Verify the pinned generator, adapter and `.js` config on Node without a compiler; never silently generate prohibited source | P-01 before domain implementation |
| Vercel proxy/session transport | Verify API prefix preservation, cookie/token rotation, exact Origin, disabled caching and cold-start behavior | P-01 feasibility and P-13 real-browser release |
| Strict immutability against DB owner | Out of scope; say exactly what is protected | Security description and submission note |
| Tight total time expectation | Document planning time and actual implementation time; cut optional work first | Throughout Phase 2 |

These are disclosed uncertainties, not invitations for the coding agent to silently choose a different policy. If an approved assumption changes, update business rules, contracts, tests, traceability, and affected documents together before implementation depends on it.

## Optional enhancements to defer

| ID | Enhancement | Why deferred |
| --- | --- | --- |
| O-01 | Email, WhatsApp, attachments, delivery receipts | External services, secrets, security, and retries exceed the core demonstration |
| O-02 | Search, charts, analytics, CSV/PDF exports | Basic filters and audit history answer the immediate need |
| O-03 | Reassignment, supervisor override, teams, tenants | More authorization and ownership transitions |
| O-04 | Registration, invitations, password reset, SSO | Seeded demo accounts cover evaluation identities |
| O-05 | Calendar/SLA administration and retroactive migration | Calendar snapshots make the baseline deterministic |
| O-06 | WebSockets, notifications, mobile polish, rich-text editor | Manual refresh/polling and plain text are sufficient |
| O-07 | Redis, Celery, event sourcing, microservices | Database-backed state plus a small maintenance sweep is sufficient |
| O-08 | Off-site immutable logs, hash anchoring, production compliance | Stronger adversary model than the assignment can support in eight hours |
| O-09 | Request-key idempotency, ticket linking, broad accessibility certification | Useful later; baseline still uses no blind retries, clear keyboard flows, and manual accessibility checks |

Core SLA logic, all three incident protections, persistent data, a usable agent screen, hosting, local-run README, and truthful submission note are not optional cuts. If they do not fit, record the precise incomplete requirement and failed acceptance check rather than claiming completion.
