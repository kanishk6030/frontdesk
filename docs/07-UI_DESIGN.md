# 07 — UI design

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## Design priorities

Readable text, explicit audience labels, few actions, and visible server outcomes. Use a neutral white/gray interface, one accent color for actions, amber for waiting, red plus text for breaches, and green plus text for completed work. Status must never depend on color alone. Implement React components in `.jsx`, use Vite and Tailwind CSS utilities with system fonts/standard controls, and avoid an additional UI kit or unnecessary visual features.

## Approved JavaScript frontend boundaries

React Router declarative mode owns the routes below; TanStack Query owns fetched state, loading/errors, invalidation and safe GET refresh. Forms/drafts stay in component state. Query keys include role/audience and user ID so a staff response can never satisfy a customer query. Cancel requests and clear the cache on logout/identity change; do not persist private data. Disable mutation retries and optimistic claim/message success.

JavaScript modules use explicit API envelopes and server field errors. Zod validates authoritative commands and DTOs on Express; client-side form validation is a usability aid. Browser code never imports Prisma, computes authoritative SLA deadlines, or relies on static types. Vite configuration uses `.js`; no route type generation or compilation step is planned.

## Screen inventory

| Route | Audience | Content and acceptance |
| --- | --- | --- |
| `/login` | Anyone | Username/password, generic validation/errors, sign-in loading state; no role impersonation toggle |
| `/agent` | Agent | One queue with Mine/Unassigned/All scope; status, priority, breach filters; visible assignment and SLA states |
| `/agent/tickets/:id` | Agent | Subject, original description, owner, conversation, separate reply/note tools, SLA panel, priority action, paginated audit history |
| `/customer` | Customer | Own-ticket list and New ticket form; no internal note previews/counts, staff history, or staff metadata |
| `/customer/tickets/:id` | Owning customer | Public conversation, status, reply or reopen controls, applicable cutoff, new-ticket guidance |

Refresh/deep links must work in the hosted deployment. API authorization remains authoritative even if a user manually loads another role's shell route.

## Agent queue

Header contains Frontdesk, current display name, and logout. Controls default to Mine + Active. Active includes OPEN, IN_PROGRESS, and WAITING_CUSTOMER; “All statuses” includes RESOLVED/CLOSED. Unassigned is the normal intake discovery view. No custom sorting, saved views, or full-text search in the baseline.

Each row shows short ticket ID, subject, customer, priority, status, assignee or “Unassigned,” first-response state/target, and resolution state/target. Use the server's timezone and `as_of`. Waiting rows show “Paused — X working hours remaining” and their auto-close cutoff. A historical breach badge remains visible even if a clock is now paused or a relaxed target is pending. Expired waits not yet processed show “Closure due.”

Click row to open detail. Include pagination (25 rows default), refresh, a clear empty state, loading state, and a recoverable error. Optional 30-second polling only while visible; no animation or continuously authoritative browser countdown. Two thousand synthetic tickets are sufficient for a representative warm responsiveness check.

## Agent ticket detail

Desktop layout uses a main conversation column and a narrow status/SLA panel. On a narrow screen these stack; precise mobile styling is optional.

1. Title and metadata: ID, subject, priority, customer, owner, status, creation time in IST.
2. Original customer description, always plain text.
3. Chronological entries with author and timestamp. Internal notes use a clearly differentiated background and “Internal note — team only” label. Show an explicit load-more control for long conversations.
4. Public reply composer labeled “Visible to customer.” Buttons: Reply, Send and wait, Send and resolve, enabled only for allowed actions. Blank text is invalid. A short helper explains that waiting pauses resolution and starts the customer-response window.
5. Separate Internal note composer labeled “Only support agents can see this.” It has its own draft and button; switching views never copies a draft into the public composer. Do not use a single ambiguous send button with a remembered visibility toggle.
6. Side panel shows both SLA metrics, current/past breach distinction, relevant due/cutoff times, and priority change with required reason. It explains a HIGH deadline as “End of arrival working day” and shows when a change creates an immediate breach.
7. History panel lists actor, event, authoritative time, before/after status/priority/deadline, and reason. For delayed automatic closure, display both effective cutoff and actual recorded time. No edit/delete controls.

Unassigned OPEN details show Take this ticket. Other agents' assigned tickets are readable with a “Assigned to [name]” notice and no enabled write actions. Staff-only notes remain available to the owner on resolved/closed tickets, but public replies require the customer to reopen or create a new ticket as applicable.

## Customer screens

The customer list contains only ID, subject, priority, status, and creation date. No last-activity preview or staff-updated timestamp can leak an internal note. New ticket asks for subject, description, and initial severity; explain HIGH as “Cannot work at all,” MEDIUM as “Work affected,” LOW as “Question or small request.” MEDIUM is the default.

Detail shows original description and only public replies. WAITING_CUSTOMER shows a reply form and auto-close cutoff. OPEN/IN_PROGRESS allow additional customer information. RESOLVED shows the reopen deadline and a distinct Reopen with explanation form through the inclusive cutoff. An ordinary reply is not silently converted into reopen. After that window, show Create a new ticket. CLOSED shows “Closed because no customer response was received” and the New ticket action. Do not imply timeout means the issue was fixed.

No customer screen fetches staff audit, internal entries, staff version, or hidden note counts. Absence from the DOM alone is insufficient; server payloads must also be clean (INC-0304).

## Interaction and error behavior

| Situation | UI behavior |
| --- | --- |
| Successful write | Show committed server state; refresh queue; clear only the successfully submitted draft |
| Claim conflict | Explain someone else claimed; refresh owner; never enable reply locally |
| Stale staff version | Keep draft, fetch current state, ask for deliberate resubmission |
| Timeout discovered during action | Show closure, preserve rejected text for copying to a new ticket; do not show it as sent |
| Expired reopen window | Show cutoff and New ticket action |
| Network uncertainty | State that result is unconfirmed; refresh entries before retry; no automatic POST retry |
| Session expires | Require login, cancel in-flight queries, clear QueryClient and drafts; never resubmit a private draft automatically |
| Forbidden/missing ticket | Generic unavailable message; no hint about another customer's ticket |
| Validation | Inline field errors plus accessible summary; maintain entered text |

Controls have programmatic labels, visible keyboard focus, predictable tab order, and pending states that prevent double clicks. Announce errors with an accessible status region. Dates include timezone text. Use real buttons and links. Never put secrets or private drafts in localStorage; keep drafts in component memory.

## UI acceptance walkthrough

Use two agent accounts in separate browser sessions and two customer accounts. Complete F-01–F-09 from [03 — User flows](03-USER_FLOWS.md), specifically a losing claim, a private note canary, a paused ticket, a resolution/reopen, and a priority escalation that immediately breaches. Inspect both rendered customer UI and network payloads. Formal test IDs are T-UI, T-INC0291, and T-INC0304 in [12 — Test plan](12-TEST_PLAN.md).
