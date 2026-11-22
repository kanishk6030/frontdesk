# Frontdesk engineering instructions

## Scope and phase gate

This repository is an approximately eight-hour full-stack hiring assignment. **Phase 2 was explicitly approved on 2026-11-21 in the user's attached master implementation prompt.** Implement P-01 through P-14 and verify the application, preserving the approved business decisions. Use official `postgres:17` through root Docker Compose for local development and isolated integration testing; hosted PostgreSQL remains the production database. Never delete existing Docker volumes or reset databases without explicit permission.

The primary source is `refrence/Hiring Test - Full Stack Developer.pdf` (actual directory spelling). Read all four printed pages; §§3–4 contain the core rules, §§1/5/6 contain time/technology/hosting/submission constraints. Do not rename or alter the PDF incidentally. User instructions take precedence over these repository instructions.

## Required reading and decision authority

Before implementing or changing behavior, read:

1. `docs/02-PRD.md` and `docs/15-REQUIREMENTS_TRACEABILITY.md` for required scope.
2. `docs/10-BUSINESS_RULES.md` and `docs/14-ASSUMPTIONS.md` for exact policy and selected interpretations.
3. `docs/06-DATABASE_SCHEMA.md`, `docs/08-API_SPEC.md`, and `docs/09-SECURITY.md` for storage, contracts, and trust boundaries.
4. `docs/11-IMPLEMENTATION_PLAN.md` and `docs/12-TEST_PLAN.md` for ordered work and verification.

The PDF is primary; approved assumptions resolve its gaps. Business rules own policy. Do not guess a new timer, state, role, or endpoint while coding. If an approved decision changes, update all affected docs, acceptance cases, and traceability in the same change. Distinguish explicit PDF requirements, inferred mechanics, assumptions, and optional additions. No empty documentation, stale placeholders, or invented test/deployment evidence.

## Permanent scope and stack rules

- Final user-approved stack: React + Vite + JavaScript/JSX + Tailwind CSS + React Router + TanStack Query; Node.js + Express JavaScript ES modules + Zod; PostgreSQL + Prisma; Vitest + Supertest + PostgreSQL integration tests. Vercel hosts the frontend; Render or Railway hosts the API. Phase 2 is now explicitly authorized by the master implementation prompt.
- Application, tests, scripts and tool configuration use `.js`/`.jsx`. Do not add TypeScript/TSX source, tsconfig, tsc, ts-node, tsx runners, or static type compilation. SQL migrations and the Prisma schema remain necessary database artifacts. Use the exact JavaScript-compatible Prisma pin/generator/configuration in document 04, not an initializer's language defaults.
- PostgreSQL is required for production and concurrency/immutability integration tests. Do not replace it with SQLite or in-memory storage.
- Use express-session with connect-pg-simple, Argon2id through argon2, and csrf-sync session-bound tokens. Bootstrap an anonymous session, regenerate it/token on login, enforce the fixed eight-hour lifetime and reload user permissions. Human mutations require X-CSRF-Token plus the configured frontend Origin. Vercel's uncached /api rewrite keeps the host-only secure cookie first-party; do not substitute wildcard CORS or cross-site cookies.
- Use Prisma interactive transactions and transaction-scoped parameterized raw SQL for PostgreSQL row locks. Prisma Migrate includes reviewed SQL constraints, grants and immutable-table triggers. Only operator tooling receives migration-owner credentials. Never run migrate/reset/db push/seed as a web-startup shortcut.
- Strict Zod schemas validate requests, allowlisted environment configuration, calendars, event data and explicit audience DTOs. Reject unknown privileged fields and invalid primitive types. Keep routing, validation, services, SLA calculations, Prisma access and response projection in clear JavaScript modules.
- Use the 480-minute implementation plan and record actual time honestly. Phase 1 time is also real effort and must be disclosed. Defer optional features before core requirements; never disguise extra work as eight hours.
- Keep the baseline small: no email integration, attachments, exports, analytics, admin hierarchy, reassignment, separate queue infrastructure, or microservices unless separately approved. The approved frontend libraries are required, not optional scope cuts.
- Do not send the assignment submission or other messages to people unless the user explicitly authorizes that communication.

## Business invariants

- Use only HIGH/MEDIUM/LOW and OPEN/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED. No arbitrary status PATCH.
- Calendar: Asia/Kolkata, Monday–Friday 09:30–18:30, no lunch deduction, explicit holiday dates. Persist UTC timestamps and freeze a calendar snapshot per ticket. Never use the browser/system local timezone as policy.
- SLA targets: response HIGH 2h, MEDIUM 4.5h, LOW 9h; resolution HIGH end of effective arrival working day, MEDIUM 27h, LOW 45h. All durations are working time unless explicitly defined otherwise.
- Waiting starts only with an owner's public question; pauses resolution, never resets the first-response result. Only a customer reply before cutoff resumes work. Notes/follow-ups/priority changes do not restart inactivity.
- Auto-close after 45 working hours of waiting; equality is expired. Completed response/resolution at the exact due time is on time. Reopen RESOLVED for 168 elapsed hours, inclusive; CLOSED timeout needs a new ticket.
- Reopen retains owner/priority and resumes remaining original resolution budget; exclude resolved time. Priority changes never reset consumed work or erase breach history. Consult the full rules for zero/negative remaining time.
- Only the assigned agent may reply, note, resolve, wait, or change priority. Nonowners can read staff tickets and claim unassigned OPEN work. Customer actions are always own-ticket scoped.

## Concurrency and transaction rules

- Lock the ticket row inside a PostgreSQL transaction for every command, then recheck authorization/state/version and obtain database time. All commands use the same domain service path; no direct model mutation from a view, UI helper, or scheduler shortcut.
- Claim has exactly one winner. A losing agent cannot reply. Same-owner retry is a no-op; other staff commands require expected_version.
- Commit ticket projection, immutable entry, and audit evidence atomically. Failure to append evidence rolls back the requested action.
- Enforce expired customer waiting on writes as well as scheduled maintenance. A due closure may commit while the late submitted action returns 409; structure transaction/error handling so the error does not roll back closure.
- GET must not mutate state. Derive current breach/closure-pending flags from one server as_of time. Do not use browser timers as authority.
- Truncate authoritative database time to milliseconds; use timestamptz(3) and exact integer millisecond durations. Check safe ranges when converting Prisma BigInt counters to Number; serialize audit BigInt IDs/cursors as decimal strings. Preserve SLA policy and deadline equality semantics.

## Privacy and immutable history

- Use distinct public-reply and internal-note routes/composers. Kind/author/body are immutable once committed. Notes must never become public through an edit or visibility switch.
- Filter public entries at query time and build customer responses from explicit allowlists. Never return an ORM model wholesale or rely on frontend hiding. Exclude internal bodies, identifiers, note counts, staff versions/updated times, and internal audit metadata from all customer surfaces.
- TanStack Query keys include audience and user ID. Cancel in-flight queries and clear cache/drafts on logout, expired session or identity change; do not persist private data. Disable automatic mutation retries and optimistic claim/message success. Disable API rewrite/CDN caching and keep unknown API paths out of the SPA fallback.
- Any future export/notification/search channel must reuse the safe projection and gain a leak regression before release. Unsupported API routes return JSON 404, never data-bearing fallback HTML.
- Audit events capture what, who, and authoritative when, plus old/new targets/status/priority and immutable message references. Preserve original evidence; corrections append new entries.
- Runtime DB identity is not owner and cannot assume owner or alter schema/guards. Audit and entry tables are append-only using restricted grants and rejection triggers; no update/delete/truncate APIs or runtime privileges.
- Set transaction-local PostgreSQL lock_timeout to five seconds and statement_timeout to ten seconds; Prisma connection acquisition limits alone do not bound row-lock waits. Map the pinned adapter's original PostgreSQL timeout code to a generic 503.
- Keep migration-owner credentials outside app runtime. Do not claim database-owner-proof tamper resistance or external delivery receipts that this system does not provide.

## Security and implementation hygiene

- Derive role/actor/customer/author/timestamps from trusted server context. Reject unknown or privileged body fields. Scope customer lookup before projection; use 404 for another customer's ticket.
- Preserve session/CSRF protections and safe cookies. Only the dedicated job-token endpoint is CSRF-exempt; it never accepts session authorization as a fallback.
- Render messages as text; validate length/enums; use parameterized queries; cap lists/batches. Do not log credentials, session/job tokens, or private message bodies.
- Store secrets in environment/secret stores, never in source, docs, frontend bundles, screenshots, or public logs. Synthetic demo data must be clearly marked; no API time override.
- Prisma 7.0.0 tooling has disclosed dependency advisories. Generate the JavaScript client at build time, then prune both development and optional dependencies so the optional CLI peer is absent from web runtime. Keep Studio local via the documented loopback/read-only wrapper; never expose it publicly. Preserve the mandated pins until an explicitly reviewed compatibility change.
- Keep changes focused. Never overwrite unrelated user work or perform a destructive database/filesystem reset to avoid debugging. Schema changes require migrations; no live destructive reseed on startup.

## Testing and delivery requirements

- Implement focused tests with each business task. Before a completion claim run the incident suites T-INC0291, T-INC0304, T-INC0318 and transaction, SLA, lifecycle, privacy, and deployment checks in document 12.
- Test real concurrent claims with independent database connections; inspect full customer payloads for private-note canaries; attempt history rewrites using the actual runtime role. UI-only tests do not prove these properties.
- Use explicit clocks for calendar/cutoff tests; include weekends, synthetic holidays, exact opening/closing, priority changes, paused/terminal intervals, and due-time equality. Do not sleep for real deadlines.
- Run JavaScript lint, Vitest unit/contract tests, Supertest HTTP tests, PostgreSQL integration tests, Prisma validation/JavaScript generation, a Vite build and a backend Node startup smoke. Include T-JSSTACK and actual Vercel proxy/cookie/deep-link checks. No static compilation check belongs in this project. Run appropriate checks once per relevant change; avoid needless repetition.
- Report what changed, which checks actually ran, their results, and any limitations. Never conflate planned tests with executed tests.
- Final Phase 2 deliverables: live URL, accessible repository, verified local-run README, and honest unfinished-work note. Keep service/data available seven days from submission; document free-host cold starts and scheduler delays.

## Completion condition for Phase 2

Continue through implementation, focused tests, regression checks, deployment preparation and honest handoff without requesting approval at each milestone. Report verified results and remaining hosting/access limitations. Do not claim a live deployment or publish/send a submission without the required access and authorization. Keep the original PDF and unrelated user files intact.
