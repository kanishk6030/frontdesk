# 08 — API specification

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Conventions

- UTF-8 JSON with `Content-Type: application/json` for mutation requests. Timestamp strings are ISO 8601 UTC with `Z` and exactly three fractional digits. Dates in calendar configuration are ISO local dates. Durations are numeric seconds, including negative remaining time and up to three decimals; internal calculations use integer milliseconds.
- User/ticket/entry IDs are UUID strings. Audit IDs and audit cursors are exact decimal strings, not JSON numbers; this preserves Prisma BigInt precision. Staff versions are positive JSON integers capped at 2,147,483,647. Priority enum: HIGH/MEDIUM/LOW. Status enum: OPEN/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED.
- All mutation bodies reject unknown fields. Identity, role, actor, timestamps, ownership, calendar, and visibility are server controlled. Maximum request body 64 KiB. Trim outer whitespace on subject/body/reason; reject blank values. Subject 1–160 characters, description/message 1–10,000, priority-change reason 1–500.
- Browser mutations require a session-bound token in `X-CSRF-Token` and an Origin exactly matching configured APP_ORIGIN. GET bootstrap creates an anonymous session before login; login needs that session/token but no authenticated user yet. Login regenerates the session and token. No separate readable CSRF cookie is used.
- Ticket writes acquire the ticket lock and use post-lock database time. Staff commands require `expected_version >= 1`. Customers do not receive or submit the staff version. No generic status PATCH, message edit/delete, export, bulk update, or role-update endpoint exists.
- Authenticated responses and auth bootstrap use `Cache-Control: no-store` plus no-store CDN controls; Vercel API rewrite caching is disabled. APIs return JSON errors, not a login redirect or SPA HTML. Unknown `/api/` routes return 404; a known route with an unsupported method returns 405. The API rewrite runs before the React Router fallback.

Success with one object uses `{ "data": ... }`. Lists use `{ "data": [...], "pagination": ..., "as_of": ... }`. Failures use `{ "error": { "code": "...", "message": "...", "fields": {} } }`; `fields` is present for validation errors only. This is a payload notation, not executable application code.

## Session endpoints

| Method and path | Access / request | Success |
| --- | --- | --- |
| GET `/api/auth/csrf` | Anyone | 200; `data.csrf_token`; creates/loads anonymous or logged-in session cookie; no ticket data |
| POST `/api/auth/login` | CSRF; `{username, password}` | 200; `data.user` containing id, display_name, role; rotated session cookie and fresh `data.csrf_token` |
| GET `/api/auth/me` | Logged-in user | 200; `data` contains id, display_name, role |
| POST `/api/auth/logout` | Session and CSRF; `{}` | 204; session invalidated |

Invalid credentials: 401 `INVALID_CREDENTIALS`, without revealing whether the username exists. Excess login attempts: 429 `RATE_LIMITED`. Expired/no session: 401 `AUTH_REQUIRED`. Password length is 1–128 characters and is not trimmed; username is trimmed/lowercased, 1–150 characters. No demo login accepts an arbitrary role override. A CSRF-bootstrap session is not an authenticated login.

## Runtime schema and serialization boundary

Every request body/route/query object has an explicit strict Zod schema in a `.js` module. Reject unknown fields, wrong primitive types, nonfinite/fractional versions, invalid UUIDs, impossible dates, unsupported enums, arrays where a scalar is expected, and out-of-range cursors. JSON command values are not broadly coerced. Query page/limit strings may be parsed as bounded decimal integers; after_id is a canonical nonnegative decimal string within PostgreSQL bigint range, with `0` as the initial sentinel. Dates supplied by a client never replace authoritative action time.

Response builders map Prisma results to public/staff allowlists and validate those DTOs with Zod before emitting JSON. Audit BigInt IDs become decimal strings; Date objects become UTC ISO millisecond strings; safe duration millisecond counters become numeric seconds. Nested event data must also be normalized. Never JSON-stringify a raw Prisma record, cast a potentially large audit ID to Number, or globally patch BigInt serialization. Schema validation failure returns a generic internal error, not the unvalidated object. Test both expected payloads and deliberately malformed values with Vitest/Supertest.

## Agent reads

| Method and path | Query | Success |
| --- | --- | --- |
| GET `/api/agent/tickets` | `scope=mine\|unassigned\|all` (mine default), `status=active\|all\|STATUS` (active default), optional `priority`, `sla=all\|breached` (all default), `page=1`, `page_size=25` (max 100) | 200; array of AgentTicketSummary, total/page/page_size/has_next, one as_of |
| GET `/api/agent/tickets/{id}` | None | 200; AgentTicketDetail |
| GET `/api/agent/tickets/{id}/entries` | optional opaque `cursor`; `limit=50` (max 100) | 200; StaffEntry array, `next_cursor` or null, as_of |
| GET `/api/agent/tickets/{id}/audit` | `after_id=0` (decimal string cursor), `limit=50` (max 100) | 200; AuditEvent array, `next_after_id` decimal string or null, as_of |

All require AGENT; CUSTOMER receives 403 before any staff query result is serialized. Nonowner agents may read entries/history. Active means OPEN, IN_PROGRESS, or WAITING_CUSTOMER. Waiting is selected via `status=WAITING_CUSTOMER`; it is combinable with the breach filter. `sla=breached` includes persisted historical breach or currently overdue pending deadlines; it does not omit breached paused tickets.

Sort queue by breach first, then the earliest pending/running deadline (nulls last), then creation time and ID. Filter before counting/pagination. `scope=unassigned` always restricts assignee to null; contradictory status filters return an empty set, not an error. Stable entry cursor encodes `(created_at, id)` and lists oldest first; audit lists ascending audit ID. Cursor inputs are validated and never interpolated into SQL.

## Agent commands

All successes below return 200 with `data.ticket` as AgentTicketDetail and, when a message is created, `data.entry` as StaffEntry. They increment version once per accepted command. The same-owner claim retry is the documented exception.

| Method and path | Request body | Preconditions and effect |
| --- | --- | --- |
| POST `/api/agent/tickets/{id}/claim` | `{expected_version}` | OPEN and unassigned → assigned IN_PROGRESS. Same owner retry returns current ticket with no new event, regardless of stale version. Different owner gets 409 ALREADY_CLAIMED |
| POST `/api/agent/tickets/{id}/replies` | `{expected_version, body, action}` | Owner only; action required, enum `reply`, `wait`, `resolve`; public entry and any status change are atomic |
| POST `/api/agent/tickets/{id}/notes` | `{expected_version, body}` | Owner; IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED; immutable INTERNAL_NOTE only |
| POST `/api/agent/tickets/{id}/priority` | `{expected_version, priority, reason}` | Owner; IN_PROGRESS/WAITING_CUSTOMER; distinct new priority; update pending targets without resetting work |

Reply actions: `reply` is allowed in IN_PROGRESS/WAITING_CUSTOMER and preserves state; `wait` only in IN_PROGRESS and starts customer waiting; `resolve` in IN_PROGRESS/WAITING_CUSTOMER marks resolved. All require a nonempty body. OPEN must first be claimed. RESOLVED/CLOSED do not accept public agent replies. Notes never affect response completion or reset waiting.

Priority success returns the recomputed SLA projection. A reason is mandatory; there is no preview mutation or implied acceptance of a new whole-day timer. The UI can show the updated result after confirmation from the server.

## Customer reads and actions

| Method and path | Request / query | Success |
| --- | --- | --- |
| GET `/api/customer/tickets` | `page=1`, `page_size=25` (max 100); optional `status=all\|STATUS` (all default) | 200; own PublicTicketSummary array, total/page/page_size/has_next, as_of |
| POST `/api/customer/tickets` | `{subject, description, priority?}` | 201; `data.ticket` PublicTicketDetail; priority defaults MEDIUM |
| GET `/api/customer/tickets/{id}` | None | 200; own PublicTicketDetail |
| GET `/api/customer/tickets/{id}/entries` | optional opaque `cursor`; `limit=50` (max 100) | 200; PublicEntry array and public-only next_cursor |
| POST `/api/customer/tickets/{id}/replies` | `{body}` | 200; `data.ticket` and `data.entry`; allowed OPEN/IN_PROGRESS/WAITING_CUSTOMER; valid wait reply resumes clock |
| POST `/api/customer/tickets/{id}/reopen` | `{body}` | 200; `data.ticket` and public explanation entry; own RESOLVED ticket at or before reopen_until |

CUSTOMER role is required; an agent uses agent routes. Customer ownership comes from session, never a customer_id body field. Lists sort newest creation first, then ID. Ticket lookup is scoped to the logged-in customer; another customer's ID is indistinguishable from absent. Customer replies do not change priority or owner. Ordinary replies to RESOLVED get 409 `REOPEN_REQUIRED`; to CLOSED get 409 `NEW_TICKET_REQUIRED`. Late reopen gets 409 `REOPEN_WINDOW_EXPIRED`. No automatically created replacement ticket.

The customer API never returns staff version, staff updated_at, all-entry counts, audit IDs, note IDs/kinds, or private bodies. Public cursor pagination is calculated only from public rows. An INTERNAL_NOTE cannot be requested via a query parameter; unexpected visibility filters are rejected.

## Response object allowlists

| Type | Exact fields |
| --- | --- |
| AgentTicketSummary | id, subject, customer `{id, display_name}`, assignee `{id, display_name}` or null, priority, status, created_at, updated_at, version, sla, wait_started_at, auto_close_due_at, closure_pending |
| AgentTicketDetail | All AgentTicketSummary fields plus description, resolved_at, reopen_until, closed_at, close_reason, calendar `{policy_version, timezone, working_weekdays, opens_at, closes_at, holidays}`, allowed_actions |
| PublicTicketSummary | id, subject, priority, status, created_at |
| PublicTicketDetail | All PublicTicketSummary fields plus description, auto_close_due_at, closure_pending, resolved_at, reopen_until, closed_at, close_reason, can_reply, can_reopen |
| StaffEntry | id, author `{display_name, role}`, kind, body, created_at |
| PublicEntry | id, author `{display_name, role}`, body, created_at; PUBLIC_REPLY rows only, with no kind field |
| AuditEvent | id, event_type, actor `{display_name, type}`, entry_id or null, occurred_at, effective_at, recorded_at, ticket_version, data |

Entry lists do not include customer credentials, raw author IDs, or hidden aggregates. The original description comes from the ticket, not the message list. Public detail deliberately omits internal SLA diagnostics and assignee identity; customer-facing reopen/wait cutoffs are sufficient. `allowed_actions` is a server-derived array of `claim`, `reply`, `wait`, `resolve`, `note`, `priority`; it aids UI rendering but does not replace authorization. It is empty for an expired wait until closure is processed.

`sla` has `as_of`, `timezone`, `first_response`, and `resolution`. Both metric objects contain `state`, `due_at` (nullable for paused/cancelled resolution or resolution completed directly from waiting), `completed_at` (nullable), `remaining_seconds`, and `ever_breached`. States:

- Running metric: PENDING until strictly after due_at, then OVERDUE. A negative resolution allowance is OVERDUE immediately, including at the recalculation instant. A relaxed target with nonnegative remaining allowance may be PENDING while ever_breached remains true.
- Satisfied first response or current successful resolution: MET if never breached, MISSED if breach evidence exists. Its remaining_seconds is measured at completion, not continually reduced afterward.
- Waiting resolution: PAUSED with null due_at, frozen remaining_seconds, and preserved ever_breached.
- Timeout closure: resolution CANCELLED with null due_at and frozen remaining_seconds; first response remains MET/MISSED.

`ever_breached` is true for stored breach evidence or a current evaluation that finds a missed target, even before maintenance persists the observation. `completed_at` is first_response_at or current resolved_at; closure is not a completion. Only staff projections expose these diagnostics. A newly tightened negative allowance is considered breached immediately per BR-09.

Resolution remaining_seconds is current budget minus consumed service, including the current running segment when present. First-response remaining_seconds is the signed working duration from evaluation time to the frozen/current response deadline; after completion evaluate at first_response_at. It can be zero during nonworking time even when a fixed deadline has passed, so state uses the timestamp rule, not remaining_seconds alone. Customer `can_reply`/`can_reopen` and staff `allowed_actions` are calculated at response time and never override a fresh locked validation on submit.

## Maintenance and health

| Method and path | Authorization / body | Response |
| --- | --- | --- |
| POST `/api/internal/maintenance` | `Authorization: Bearer` job secret; `{}` only; no session fallback | 200; `data` contains processed, closed, breaches_recorded, errors, has_more, as_of |
| GET `/healthz` | Public; no authentication | 200 `data.status=ok` if web and DB are ready; 503 generic unavailable otherwise |

Maintenance processes at most 100 candidate tickets per call, rechecks each under a lock, and skips locked rows for a later run. The runner follows has_more up to ten calls, reports any nonzero errors, and retries on a subsequent run. Missing/invalid job credential is 401 `JOB_AUTH_REQUIRED`. No arbitrary time, actor, or ticket IDs can be supplied to this endpoint. Health reveals no database URL, version, username, or counts.

## Errors and conflict order

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | INVALID_INPUT | Invalid JSON, unknown fields, invalid enum/length/query/cursor; field details are safe |
| 401 | AUTH_REQUIRED / INVALID_CREDENTIALS / JOB_AUTH_REQUIRED | Authentication missing or rejected |
| 403 | FORBIDDEN / CSRF_FAILED | Wrong role/ownership or CSRF rejection; no private payload |
| 404 | NOT_FOUND | Resource absent, customer cannot see it, or unsupported API path |
| 405 | METHOD_NOT_ALLOWED | No edit/delete method on a known endpoint |
| 409 | ALREADY_CLAIMED | Another agent owns the ticket |
| 409 | STALE_VERSION | Staff state changed; refresh before deliberate retry |
| 409 | INVALID_TRANSITION / NO_CHANGE | State/action forbidden or same-priority request |
| 409 | CUSTOMER_TIMEOUT | Due timeout was just committed; requested action was not performed |
| 409 | REOPEN_REQUIRED / REOPEN_WINDOW_EXPIRED / NEW_TICKET_REQUIRED | Explicit reopen or new-ticket flow needed |
| 413 | REQUEST_TOO_LARGE | Body exceeds 64 KiB |
| 429 | RATE_LIMITED | Login attempt limit exceeded |
| 503 | SERVICE_UNAVAILABLE | Database unavailable or transient lock timeout; no success claimed |
| 500 | INTERNAL_ERROR | Unexpected failure; generic message and correlation ID only |

Order: authenticate → validate syntax → scoped lookup and route role authorization → lock, recheck command-specific ownership, and obtain server time → commit overdue timeout if any → claim's existing-owner/different-owner special case → expected_version for staff → state-specific validation → business action. Claim is exempt from the usual owner-only write guard so a competing agent receives ALREADY_CLAIMED, not an early FORBIDDEN. A routine stale/invalid command has no side effects. The timeout branch intentionally returns an error after a committed system transition; emit the HTTP response only after the transaction exits successfully.

For a customer conflict, return only the error and a safe next action string if needed, never a staff DTO. For a staff conflict, do not send a stale draft or private server state in the error; the UI refetches. No mutation response is issued before the transaction commits.

## Contract examples

An agent's wait request has the shape `{ "expected_version": 3, "body": "Please share the failing order number.", "action": "wait" }`. Success includes the public entry and a WAITING_CUSTOMER ticket with null resolution due time and a populated auto_close_due_at. The body and wait transition are either both persisted or neither is.

A competing claim returns `{ "error": { "code": "ALREADY_CLAIMED", "message": "This ticket has already been claimed." } }` with HTTP 409. It must not permit that caller to send an agent reply afterward.

A private note is posted only to `/notes` with body and expected_version. Adding a `kind`, `customer_id`, or `created_at` field is INVALID_INPUT, not an opportunity to override the server's interpretation.

Tests T-CONTRACT, T-INC0304, T-INC0291, and T-LIFECYCLE verify these payload and error boundaries. Supporting authentication and deployment restrictions are in [09 — Security](09-SECURITY.md).
