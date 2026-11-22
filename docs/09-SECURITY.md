# 09 — Security and evidence boundaries

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Authentication and session storage

Use Argon2id through the argon2 package and express-session with connect-pg-simple. Demo users are seeded in PostgreSQL; there is no registration, password reset, impersonation, role-changing route, or admin UI. Role is AGENT or CUSTOMER. The session contains user ID and CSRF state; protected requests reload the user and active status rather than trusting role input or an indefinitely stale session role.

Production cookie `frontdesk.sid`: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain attribute. Use an absolute eight-hour authenticated lifetime, not a sliding renewal: store its expiry at login, enforce it on every protected request, and keep cookie expiry within that remaining lifetime. Regenerate the session ID after successful login, generate a fresh CSRF token, and destroy the session/clear the cookie on logout. Passwords and cookies are never returned in JSON or stored in localStorage.

Persist sessions in the migration-created store table; disable create-table-on-start. MemoryStore is unsuitable for this deployed design because sessions must survive backend restarts. Save session changes before returning login/bootstrap success so the next request can retrieve them. No password hashing or session I/O belongs inside a ticket row-lock transaction. [Express session middleware](https://expressjs.com/en/resources/middleware/session.html).

## Vercel proxy, CSRF, and browser origins

Vercel serves the React app and rewrites `/api/*` to backend `/api/*`. Browser calls use relative URLs and same-origin credentials. A host-only cookie returned through the rewrite belongs to the frontend host; it must not carry the backend's Domain. Verify cookie forwarding through the real deployment rather than assuming that a successful direct-backend login proves browser login works.

Use csrf-sync's session-bound synchronizer token. GET `/api/auth/csrf` establishes/loads an anonymous session and returns a token in JSON; no separate readable CSRF cookie is required. Every human POST, including login/logout, sends that token in `X-CSRF-Token` and an Origin exactly matching configured APP_ORIGIN. Reject a missing/foreign/null Origin on unsafe browser routes. Login rotates session and token; the UI replaces its in-memory token from the login response. [csrf-sync](https://github.com/Psifi-Solutions/csrf-sync).

The job-token route alone bypasses session CSRF/origin authentication; it requires a dedicated Authorization bearer secret and accepts no session fallback. Safe ticket GETs remain side-effect-free. CORS does not replace authorization or CSRF: the browser uses the Vercel/Vite proxy, so the baseline emits no wildcard or credentialed cross-origin CORS grants. Direct backend browser requests are not a second supported login flow. Vercel previews are not automatically trusted; explicitly configure a reviewed frontend origin if a preview must use a separate demo backend.

Trust only the verified hosting proxy path for secure-cookie/protocol detection. Start with one trusted immediate hosting proxy hop and test actual forwarded-protocol behavior; restrict the service to the managed ingress path. Do not enable blanket proxy trust or use forwarded Host/Origin as the allowlist. APP_ORIGIN is operator configuration. The backend remains directly reachable for health and secret-authenticated maintenance; that does not bypass ordinary route authorization.

Use express-rate-limit for ten login attempts per minute per normalized username, including nonexistent usernames, with a process-local store in the single-instance demo. This avoids treating all Vercel-proxied users as one apparent IP. Return generic 429 or invalid-credentials 401 without account-existence detail. This limit resets on restart and is not distributed abuse protection; stricter edge controls are deferred.

## Authorization matrix

| Action | Unauthenticated | CUSTOMER | AGENT not owner | AGENT owner | SYSTEM job |
| --- | --- | --- | --- | --- | --- |
| Read customer list/detail | 401 | Own only | Not this route | Not this route | No |
| Create ticket | 401 | Own identity only | No | No | No |
| Customer reply/reopen | 401 | Own and legal state/cutoff | No | No | No |
| Read staff queue/detail/history | 401 | 403 | Yes | Yes | No |
| Claim unassigned OPEN ticket | 401 | 403 | Yes, atomic | Same-owner retry only | No |
| Agent reply/wait/resolve/priority | 401 | 403 | 403 | Legal state only | No |
| Internal note | 401 | 403 | 403 | Assigned ticket, including terminal states | No |
| Edit/delete entries or audit | No route | No | No | No | No |
| Automatic timeout / breach observation | No | No | No | No | Authenticated maintenance; also enforced by command service |

Wrong role gets 403; customer-scoped missing/other-customer IDs both get 404. IDs are not secrets. The server derives actor, customer, author, timestamps, ownership and entry kind. Strict Zod schemas reject unexpected privileged fields. Each write rechecks applicable state and ownership under the ticket lock.

## Runtime validation without static types

Validate environment once at startup and fail closed on malformed required settings. Parse every body, route parameter, query, calendar and event-data object with explicit Zod schemas in `.js` modules. Use strict objects; never silently strip an attacker-supplied owner/kind field and pretend it was accepted. Do not broadly coerce booleans, nulls, blank strings or numeric JSON strings into valid commands. Query pagination/ID strings receive narrowly specified parsing.

Construct public/staff DTOs with explicit allowlists and validate each response shape before sending. Serialize audit BigInts to decimal strings, dates to UTC millisecond ISO strings, and durations only after safe integer conversion. Map validation errors to safe field messages without echoing secret/private values. Lint plus Vitest/Supertest contract tests catch incorrect property names, invalid enum/state combinations and accidental relationship leakage.

## INC-0291 — Exclusive claiming

Use a Prisma interactive transaction and transaction-scoped parameterized row lock. Check current owner/status and commit claim plus audit together. A competing claimant receives 409 and cannot subsequently submit an agent reply. Staff expected_version prevents stale commands; it does not replace the database lock. JavaScript's event loop cannot serialize competing HTTP requests or replicas safely. Test with independent committed connections and sessions.

## INC-0304 — Internal note isolation

- Public replies and internal notes have separate routes/composers; entry kind is immutable.
- Customer Prisma queries filter PUBLIC_REPLY before pagination, then use the public allowlist/Zod DTO. Exclude private body, note ID/kind/count, staff version/updated_at, and audit data.
- Customer list titles come from the original customer subject; no last-entry preview or all-entry aggregate can reveal a note. Public cursors/counts use only public rows.
- Agent role checks run before staff projection. No hidden note HTML, debug payload, error echo, logging, analytics or browser persistence.
- API/auth responses set Cache-Control: no-store and equivalent CDN controls; disable Vercel rewrite caching for `/api/*`. Never apply public asset caching rules to authenticated API responses.
- TanStack Query keys include audience and user ID. Cancel in-flight requests and clear the QueryClient and drafts on logout/session loss/identity change; do not persist caches. Test an agent-to-customer login switch in the same browser.
- No export/notification/search feature is added. Unsupported API/export paths return JSON 404 through the proxy. Future output channels must reuse the safe projection and add leak tests.

Use a unique private-note canary and inspect full HTTP responses, pagination, rendered pages, and cache behavior. A UI-hidden note in a network response is still a failure. [Vercel rewrite caching controls](https://vercel.com/docs/rewrites).

## INC-0318 — Immutable evidence

Every accepted mutation and evidence share a Prisma transaction. Record server identity, role/name snapshot, authoritative database time, old/new business values and immutable entry references. An audit insert failure rolls back the mutation. Database time is truncated to milliseconds consistently; the recorded_at insert trigger overrides caller values. No client/API time override is accepted.

The runtime DB user is not an owner, cannot assume owner or alter schema/guards, and has SELECT/INSERT only on entries/audit. Explicit grants and triggers prevent UPDATE, DELETE and TRUNCATE. Custom SQL protections are versioned in Prisma migrations and tested with actual runtime credentials, including Prisma mutation methods and direct SQL. Ordinary Prisma schema validation does not prove these protections exist. [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html).

The trusted database/migration owner can ultimately replace or alter the database. Off-site tamper evidence is deferred. Portal publication timestamps do not prove external mail delivery or customer reading. Disclose these boundaries in handoff; do not claim stronger guarantees.

## Public-host controls

| Risk | Baseline control |
| --- | --- |
| Injection | Prisma queries and tagged parameterized raw SQL; fixed identifiers/allowlisted sorting; no unsafe query concatenation |
| XSS | Plain-text entries and React escaping; no raw HTML renderer |
| CSRF/session theft | First-party proxy topology, synchronizer token, exact Origin, secure cookies, fixed expiry |
| Invalid transitions | Zod validation plus BR-10 domain guards, no generic status PATCH |
| Resource abuse | Express JSON body cap 64 KiB; strings/list limits; login limiter; bounded maintenance batches/pools |
| Secret/debug leakage | NODE_ENV=production; central JSON error middleware; no stack/SQL/message-body/token echo |
| Supply of secrets | Backend/operator secret stores only; no secrets in VITE_* values, generated clients, docs or frontend bundle |
| Frame/content attacks | Helmet on backend and matching Vercel frontend headers; deny framing, nosniff, restrictive asset-compatible CSP |
| Proxy/cache mistakes | API rewrite precedes SPA fallback; explicit no-store on auth/data; origin allowlist from configuration |
| Database access | Separate runtime/migration identities, provider-appropriate TLS, restricted external access |
| Maintenance abuse | High-entropy bearer token, constant-time comparison, no query-string token, no arbitrary actor/time/ID input |

Use a normal managed Node process on Render/Railway, not a development server in production. Do not disable cookie/CSRF/validation safeguards to make the separate deployment work; fix the proxy/origin settings and rerun the real browser check.

## Evidence required for sign-off

Pass T-INC0291, T-INC0304, T-INC0318, T-ATOMIC, T-AUTH, T-SECURITY and T-JSSTACK from [12 — Test plan](12-TEST_PLAN.md). Inspect runtime grants, owner-secret absence, login/token rotation through Vercel, unknown-API handling, and cache isolation across users. A note leak, unprotected audit write, or runtime validation bypass blocks a completion claim.
