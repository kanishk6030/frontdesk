# 01 — Project brief

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Source and context

The primary source is the four-page [Hiring Test — Full Stack Developer](../refrence/Hiring%20Test%20-%20Full%20Stack%20Developer.pdf), dated 21-11-2026. The user named `reference/`; the supplied folder is actually `refrence/`. References throughout use the PDF's numbered sections and printed page numbers. §§3–4 contain the product and incident requirements; §§1, 5, and 6 constrain technology, time, hosting, and submission.

Arvo Systems has nine support agents handling approximately forty customer problems daily. A shared spreadsheet and WhatsApp group no longer provide reliable coordination or evidence. Approximately one in five problems was late last quarter, and managers could not explain which ones or why (§2, p. 2). That is background, not a promised quantitative improvement target for this eight-hour exercise.

## Problem and intended outcome

Frontdesk should give agents a dependable view of ownership, deadlines, customer waiting, and conversation history. It must prevent simultaneous ownership, protect internal notes, and retain trustworthy evidence of actions. An evaluator must be able to open a hosted working application, exercise these behaviors, and run the repository locally (§§1, 5–6).

Success means a complete small support workflow, with deterministic calendar-aware SLAs and verifiable regression protection for INC-0291, INC-0304, and INC-0318. Visual polish and enterprise administration are secondary to correctness and an honest account of omissions.

## Users and stakeholders

| Role | Need | Scope |
| --- | --- | --- |
| Support agent | Claim a ticket, reply, write private notes, identify late/waiting work | Main screen and ticket detail; can read the shared queue, only change own tickets |
| Support lead / manager | Explain who acted and why a ticket is late | Uses agent view and immutable history; no separate admin role |
| Customer | Receive replies, supply requested information, dispute a resolution | Small authenticated portal for own tickets only; inferred mechanism to demonstrate §3 |
| Evaluator | Verify behavior and reproduce setup | Live URL, repository, local-run README, limitations note |
| System maintenance | Close unanswered waiting tickets and record breaches | Authenticated service action, not an interactive user |

## Baseline scope

- Seeded authenticated identities, customer ticket intake, priorities HIGH/MEDIUM/LOW, shared/unassigned/mine queues, and atomic claim.
- Plain-text public replies and separate internal notes, with server-enforced visibility and ownership.
- Working-calendar response and resolution targets, configurable holiday exclusions, visible current/historical SLA breaches, customer-wait pauses, automatic inactivity closure, controlled reopening, and explicit priority-change policy.
- Transactional, append-only audit evidence; persistent PostgreSQL data; focused automated and manual verification.
- Vercel frontend, Render/Railway API, hosted PostgreSQL, a scheduled maintenance trigger, and a complete handoff available for seven days from submission. A frontend `/api` proxy keeps browser session requests first-party.

Explicit demands, necessary inferences, chosen assumptions, and optional enhancements are separately enumerated in [02 — PRD](02-PRD.md), [14 — Assumptions](14-ASSUMPTIONS.md), and [15 — Traceability](15-REQUIREMENTS_TRACEABILITY.md). Customer portal, login mechanism, statuses, timezone, and exact ambiguous durations are proposed design choices, not verbatim PDF requirements.

## Architecture in one paragraph

Use React, Vite, JavaScript/JSX, Tailwind CSS, React Router, and TanStack Query for the browser interface. Node.js/Express JavaScript ES modules provide session authentication, Zod-validated JSON endpoints, and domain services; Prisma connects them to PostgreSQL. Vercel serves the frontend and proxies `/api` to Render/Railway, while a scheduled GitHub Actions job calls the backend maintenance endpoint. Vitest, Supertest, and real PostgreSQL verify behavior. Source uses `.js`/`.jsx` with no static type compilation. Runtime schemas, explicit module/DTO boundaries, and automated tests protect correctness.

## Time, deliverables, and boundaries

The proposed Phase 2 work budget is **480 minutes**, including implementation, targeted tests, deployment, and handoff. Phase 1 documentation time must be recorded separately and disclosed; the PDF's approximate eight-hour expectation may include all preparation (A-28). The plan must not misrepresent total effort.

The eventual submission has exactly four requested items: live URL, repository link, README explaining local execution, and a short note saying what was not finished and why (§§5–6, p. 4). Keep the deployment accessible for one week after submission. This phase creates the 15 numbered design documents and root `AGENTS.md`; it does not claim to have delivered those application artifacts yet.

## Reading order and authorities

1. [02 — PRD](02-PRD.md) and [03 — User flows](03-USER_FLOWS.md): observable behavior.
2. [10 — Business rules](10-BUSINESS_RULES.md) and [14 — Assumptions](14-ASSUMPTIONS.md): exact interpretations and trade-offs.
3. [04 — Tech stack](04-TECH_STACK.md), [05 — Architecture](05-ARCHITECTURE.md), [06 — Database](06-DATABASE_SCHEMA.md), [07 — UI](07-UI_DESIGN.md), [08 — API](08-API_SPEC.md), [09 — Security](09-SECURITY.md): implementation contract.
4. [11 — Plan](11-IMPLEMENTATION_PLAN.md), [12 — Tests](12-TEST_PLAN.md), [13 — Deployment](13-DEPLOYMENT.md), [15 — Traceability](15-REQUIREMENTS_TRACEABILITY.md): execution and evidence.

The PDF remains primary. Explicit user-approved decisions may resolve its ambiguity; documentation must never silently override an explicit requirement. Business rules own policy; schema/API describe how it is represented. Resolve disagreements by updating the package coherently.

## Principal risks

The same-day HIGH resolution target creates a short late-day allowance and tension with a broad reading of the Friday example. Actual holidays and timezone are not provided. Free hosting, API proxy cold starts, and scheduled jobs can delay processing. The selected Prisma JavaScript generator has an explicit version/deprecation constraint. Append-only database controls do not defeat a malicious database owner. The full timebox is tight; defer document 14's optional enhancements while preserving the incident protections and every user-mandated stack component.
