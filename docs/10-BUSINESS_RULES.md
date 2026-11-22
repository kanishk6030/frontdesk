# 10 — Business rules

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

Primary source: [Hiring Test — Full Stack Developer](../refrence/Hiring%20Test%20-%20Full%20Stack%20Developer.pdf), §§3–4, printed pp. 2–4. The directory in this checkout is spelled `refrence`. **E** means explicit in the PDF; **I** means necessary inference; **A** means a selected assumption. Decision IDs are expanded in [14 — Assumptions](14-ASSUMPTIONS.md).

## BR-01 — Actors, intake, and ownership

- **E:** agents need a ticket screen and customer replies; two agents must not take the same ticket (§3; §4.1, INC-0291).
- **I/A:** authenticated `AGENT` and `CUSTOMER` are the only application roles. The support lead uses `AGENT`; `SYSTEM` is an audit actor, not a login. A customer can create, read, reply to, and reopen only their own tickets. Agents can read all tickets but may change only tickets they own. There is no organization or tenant model (A-01, A-02).
- Creation records a customer, subject, description, and initial priority. Default priority is `MEDIUM`. The ticket starts `OPEN`, unassigned. Its immutable creation time starts both SLAs, including time spent unassigned. Public web registration and agent-created tickets are deferred (A-03).
- Claiming atomically changes `OPEN` / unassigned to `IN_PROGRESS` / requesting agent. Acquire a PostgreSQL row lock, inspect the committed state, assign, and append history in one transaction. A second agent gets HTTP 409 and cannot reply. A repeated claim by the existing owner returns the existing ticket without another event. Ownership is retained through waiting, resolution, reopening, and closure. Reassignment and release are out of scope (A-04).
- A disabled button is only a convenience: every write checks identity, ownership, and legal status on the server under the same lock. Internal notes also require ownership.

## BR-02 — Calendar and time arithmetic

**E:** Monday–Friday, 09:30–18:30; weekends and festival holidays excluded (§3, p. 3). **A-05/A-06:** use `Asia/Kolkata`, with no lunch deduction. One working day is 9 hours, half a day is 4.5 hours, and one working week is 5 working days / 45 hours.

All ticket, SLA, entry and audit timestamps are UTC instants at millisecond precision; display them in the ticket's business timezone with an explicit `IST` label. Database command time is truncated to milliseconds before calculations, matching JavaScript Date and Prisma DateTime; timestamp columns use timestamptz(3). Working durations use exact integer milliseconds, never rounded displayed hours. This representation decision is A-31; the policy durations and boundary comparisons are unchanged. The browser's timezone never changes a deadline. Each ticket captures a complete immutable calendar snapshot: policy version `v1`, timezone, working weekdays, opening/closing times, and sorted holiday dates. Configuration changes affect new tickets only. Reopening uses the original snapshot (A-07).

Holiday configuration is an explicit list of local dates. Normalize duplicate valid dates into one sorted date list; reject malformed dates. No national or religious calendar is guessed from the company address. The demo may use an empty list labeled as such; deterministic tests use a synthetic holiday. Actual Arvo holidays are an operational input, not a reason to leave the exclusion algorithm unfinished. No calendar editor or retroactive recalculation is in scope.

Define these operations in pure JavaScript modules using explicit Luxon timezone conversions and exact millisecond durations. Parse holiday strings as local dates in the calendar's timezone, never through the host's implicit timezone:

1. `next_work_instant(t)` returns `t` if it lies in a working interval; otherwise the next opening. Working intervals are half-open: `[09:30, 18:30)`. Exactly 18:30 is after hours for a new clock.
2. `work_between(a, b)` sums intersections of `[a, b)` with working intervals. It is zero if `a = b`; invalid reversed intervals are rejected.
3. `add_work(t, duration)` walks eligible intervals starting at `next_work_instant(t)`, skipping all excluded dates. If positive duration is exhausted exactly at closing, return that closing instant, not the next opening. Zero duration means immediately at `t`, not a new allowance next morning.
4. Never add 24 hours to implement a working day or truncate partial days. Persist actual instants; round only presentation text.

Server time is obtained from PostgreSQL after acquiring the ticket lock and reused for that command's calculations and events. A delayed request uses processing time, not a client-supplied or pre-lock timestamp (A-08).

## BR-03 — Priority targets

| Priority | Meaning | First public agent response | Resolution budget |
| --- | --- | --- | --- |
| `HIGH` | Customer cannot work at all; includes “urgent” | 2 working hours | Working time from the original effective start to 18:30 on that working date |
| `MEDIUM` | Medium problem | 4.5 working hours | 27 working hours / 3 working days |
| `LOW` | Question or small request | 9 working hours | 45 working hours / 1 working week |

**E:** qualitative priorities and promises come from §3, pp. 2–3. **A-09/A-10:** “about” becomes an exact target for reproducible tests. “Same working day” is the end of the effective arrival date, not a rolling 9-hour allowance. For after-hours, weekend, or holiday arrivals, the effective start is the next opening.

Example without holidays: a `HIGH` ticket created Friday 2026-11-20 at 18:00 IST has response due Monday 2026-11-23 at 11:00 IST and resolution due Friday at 18:30 IST. This deliberately preserves the literal same-day resolution promise. It conflicts with a universal reading of the meeting's “not late on Sunday” example; that example is interpreted as rejecting weekend time accumulation, not cancelling an already-expired high-priority deadline. A `MEDIUM` or `LOW` ticket arriving at that time is not late on Sunday. This is a material interpretation for Phase 1 review, not a hidden extra rule.

## BR-04 — First response

- The deadline is `add_work(created_at, response_budget(priority))`. Claiming does not start or satisfy the SLA.
- Only the first successfully committed public reply from the assigned agent satisfies it. A public reply accompanying `wait` or `resolve` qualifies. A customer message, private note, failed submission, or automated closure does not (§3; INC-0318; A-11).
- The application publishes replies into the authenticated customer portal. The measured instant is server acceptance within the transaction, visible only after commit. It is not proof of email delivery, customer receipt, or reading (A-12).
- Once the first response is recorded, its timestamp, applicable deadline, and historical outcome are frozen. Later priority changes and reopening do not create another first-response SLA (A-13).

## BR-05 — Resolution clock and boundaries

The ticket stores a total resolution budget, consumed working duration at its latest clock checkpoint, a nullable running-since instant, and a nullable current deadline. At creation: consumed is zero, running-since is creation, and deadline is `add_work(created_at, budget)`.

While running at instant `t`, elapsed service time is stored consumed duration plus `work_between(running_since, t)`. A checkpoint adds that working time to consumed and either stops the clock or starts a new running segment at `t`. Ordinary notes and replies do not restart the clock.

To start or recalculate a running segment, calculate `remaining = budget - consumed`:

- Positive remaining: deadline is `add_work(t, remaining)`.
- Zero remaining: deadline is `t`; no fresh allowance is granted.
- Negative remaining: deadline is `t` and the ticket is already in breach; record that discovery now if it has never been recorded. Retain the original missed deadline in audit history.

Completing at exactly an unbreached applicable deadline is on time. A pending, running metric is overdue when server time is strictly greater than its fixed deadline, even during a later weekend or holiday. A negative remaining resolution allowance is already overdue at the recalculation/resume instant; equality with its immediate deadline cannot undo that breach. A deadline is not pushed forward just because the office closed. This comparison also catches a missed Friday-closing deadline before working duration starts accumulating again Monday (A-14).

Before every clock-changing command, evaluate the *old* deadline at command time. Never erase an expired deadline by first pausing, resolving, or relaxing priority. Evaluation is also performed by maintenance. Read endpoints calculate current overdue flags without writing.

The first observed breach of each metric is permanent evidence. Store the observation time and an immutable event containing the applicable deadline and policy. `ever_breached` remains true after a downgrade, pause, resolution, or reopening. An untouched running deadline can be identified as missed from that deadline; a newly tightened policy takes effect at the priority-change time and does not invent a historical event before that change. The UI distinguishes a currently overdue clock from a historical breach (A-15).

## BR-06 — Waiting for the customer and pauses

**E:** customer waiting must not count against agents (§3). **A-16:** only an explicit agent action “Send and wait” starts waiting; it must atomically publish a nonempty public question and change `IN_PROGRESS` to `WAITING_CUSTOMER`. An internal note cannot start a pause. This ensures the first-response clock has been satisfied before waiting.

On entering waiting:

1. Evaluate existing breaches and record the public reply / first response if applicable.
2. Checkpoint resolution consumption and stop its running segment. Save the old deadline in the audit event; set the current resolution deadline to null while paused.
3. Set `wait_started_at = t` and `auto_close_due_at = add_work(t, 45 hours)`.

The customer reply that is accepted **before** the auto-close deadline ends the wait and returns the ticket to `IN_PROGRESS`, with the same owner. The paused period consumes no resolution budget. Resume from the remaining budget at the reply time, clear waiting fields, and audit the old and new deadline.

Agent notes and ordinary public follow-ups during waiting do not resume the clock or reset the inactivity deadline. A repeated “Send and wait” while already waiting is rejected. Only a new wait after an actual customer reply starts a new 45-hour inactivity window (A-17).

An agent may resolve a waiting ticket by sending a public resolution. It stops the existing pause; do not add waiting time to consumed service. No manual pause, vacation pause, or arbitrary “on hold” state is included. Reopening also excludes time spent resolved; that is a terminal-period exclusion, not customer waiting.

## BR-07 — Automatic closure

**E:** close when the customer has not replied for about one working week (§3). **A-18:** exactly 45 working hours after the latest genuine wait began, independent of ticket priority. The timer is not itself paused by waiting. At `t >= auto_close_due_at`, the window has expired.

Maintenance closes due `WAITING_CUSTOMER` tickets to `CLOSED` with reason `CUSTOMER_TIMEOUT`, preserving ownership and messages. Resolution is cancelled, not counted as successfully fixed; previous breach evidence remains. Closure records both `effective_at` (the due instant) and `recorded_at` (when processed). It must not pretend the server executed at the earlier instant.

A scheduled external POST runs maintenance every 5 minutes; it is also run on deployment. Delayed scheduling or a sleeping free host can delay persisted closure. On every ticket mutation, the same locked service first checks and commits any overdue closure. A late customer message is rejected with 409, not inserted, and the closure event remains committed. Reads have no side effects: until maintenance runs, an expired waiting ticket shows “Closure due” with `closure_pending=true`. There is no guaranteed five-minute hosting SLA (A-19).

The cutoff is deterministic: a reply processed exactly at the due instant loses to closure, even if the scheduler has not run. A reply processed just before it wins and removes eligibility. Job retries and concurrent jobs must create only one closure event.

## BR-08 — Resolution, reopening, and new tickets

**E:** an unhappy customer can reopen a done ticket for about a week, then must start a new ticket (§3). **A-20:** “done” means `RESOLVED`; reopening is allowed for exactly 7 calendar days / 168 elapsed hours after the most recent resolution. The PDF explicitly calls the inactivity period a *working* week but not this period; calendar time gives a clear customer-facing cutoff.

- “Send and resolve” requires a nonempty public resolution from the owner and transitions `IN_PROGRESS` or `WAITING_CUSTOMER` to `RESOLVED`. Capture the resolution outcome, current/final target, consumed duration, `resolved_at`, and `reopen_until = resolved_at + 168 hours`. Stop the resolution clock. If resolved while waiting, the final target remains null because that clock was paused; the recorded remaining duration and prior deadline explain the outcome.
- Only the owning customer may explicitly reopen, supplying a nonempty explanation, when `t <= reopen_until`. At the exact boundary reopening succeeds. An ordinary reply on a resolved ticket returns 409 with guidance to use Reopen.
- Reopening transitions directly to `IN_PROGRESS`, retains the assignee and current priority, and resumes the original resolution budget minus previously consumed working time. Time spent resolved is excluded. There is no fresh full resolution allowance and no new first-response timer (A-21).
- Clear the current `resolved_at` / `reopen_until` fields on reopen; the immutable resolution event retains them. A later resolution starts a new seven-day reopening window. Repeated cycles are allowed and all are audited.
- After expiry, the ticket remains `RESOLVED` and read-only to customer messages/reopening. Do not silently make another ticket. Show “Create a new ticket”; the customer submits a separate form with a new ID and fresh SLAs. Optional linking to the old ticket is deferred.
- A `CLOSED` timeout ticket is terminal and cannot be reopened. Later contact creates a new ticket. This keeps inactivity closure distinct from a disputed fix (A-22).

## BR-09 — Priority changes

**E:** mid-ticket urgency was explicitly unresolved in the meeting (§3, final paragraph). **A-23:** the owner may change priority in `IN_PROGRESS` or `WAITING_CUSTOMER`, with a required nonempty reason. No changes on `OPEN`, `RESOLVED`, or `CLOSED`.

Evaluate and preserve any old breaches, checkpoint a running resolution clock, then apply the new targets. Unanswered response is recalculated from original creation. Completed first-response evidence stays fixed. Resolution uses a new total budget derived from the **original effective creation date**, subtracting service already consumed; priority change never restarts the allowance. If still waiting, keep the resolution deadline null and do not change auto-close time. A negative remaining allowance is an immediate breach, including during waiting. Zero is due immediately on the next running segment.

Recalculation may make a ticket immediately late. A downgrade may give positive remaining time, but cannot erase previous breach events. Store old/new priorities, reason, budgets, deadlines, remaining time, and breach observations in history. Reject changing to the existing priority as a 409 no-op. The choice prevents urgency cycling from laundering elapsed work while making the previously unspecified policy visible.

## BR-10 — State transition matrix

| From | Command / actor | To | Conditions and clock effect |
| --- | --- | --- | --- |
| None | Create / owning customer | `OPEN` | Unassigned; both SLAs start at creation |
| `OPEN` | Claim / agent | `IN_PROGRESS` | Atomic assignment; clocks unchanged |
| `OPEN` | Customer reply | `OPEN` | Public message only; clocks unchanged |
| `IN_PROGRESS` | Agent ordinary reply / customer reply | `IN_PROGRESS` | Agent reply may satisfy first response |
| `IN_PROGRESS` | Send and wait / owner | `WAITING_CUSTOMER` | Public question; pause resolution; start inactivity timer |
| `WAITING_CUSTOMER` | Customer reply before cutoff | `IN_PROGRESS` | Resume remaining resolution allowance |
| `WAITING_CUSTOMER` | Owner ordinary reply | `WAITING_CUSTOMER` | No timer reset |
| `IN_PROGRESS`, `WAITING_CUSTOMER` | Send and resolve / owner | `RESOLVED` | Public resolution; stop clock; open seven-day reopen window |
| `WAITING_CUSTOMER` | Expiry / system | `CLOSED` | Cancel outstanding resolution; timeout reason |
| `RESOLVED` | Reopen / owning customer within window | `IN_PROGRESS` | Public explanation; same owner; remaining allowance |
| `IN_PROGRESS`, `WAITING_CUSTOMER` | Priority change / owner | Same | Recalculate per BR-09 |
| `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED` | Internal note / owner | Same | No public activity or clock changes, except any already-due closure is processed first |

All unlisted transitions are rejected. There is no generic status PATCH, agent reopening, manual close, unclaim, assignment transfer, message edit, or deletion API. An expired wait is closed before *any* submitted action; return 409 without executing that submitted action so the caller refreshes deliberately.

## BR-11 — Visibility and immutable evidence

**E:** internal notes must never appear on any customer surface (§4.2, INC-0304). Public replies and notes are immutable entries with an immutable kind selected by separate endpoints. Customer queries select public replies only; customer response objects use an explicit field allowlist. No internal notes, note metadata/counts, internal audit payloads, or team-only snippets appear in customer lists, details, errors, or future exports. There is no export feature in the baseline.

**E:** record what happened, when, and who, without later changes (§4.3, INC-0318). Each accepted business mutation and its audit event commit together. Actor identity comes from the session or the dedicated system actor; timestamps come from the database. Events include creation, claim, public replies, internal-note references, wait/resume, priority changes, resolution, reopening, automatic closure, and first observations of SLA breaches. Message text lives in immutable entries referenced by events; do not duplicate private bodies in metadata.

Audit and entry rows cannot be updated, deleted, or truncated by the runtime database role; database triggers additionally reject updates/deletes and statement-level truncation. Application users, including leads, have no audit-write interface. Corrections are new messages/events. This protects against users and normal application access, not a database owner deliberately replacing the database or disabling protections. Off-site tamper evidence is deferred and must not be falsely claimed (A-24).

## BR-12 — Retries, serialization, and presentation

Each staff write carries the ticket's `expected_version`; under the lock, reject a stale value with 409 and no requested mutation. A successful business command increments the version once, even if it appends several audit events. Claim's same-owner retry is the sole idempotent command exception. Customer writes omit staff versions so internal-note activity is not exposed through a customer concurrency token; server locking, status checks, and cutoff checks still apply (A-25).

The UI prevents double submission and does not blindly retry message POSTs after an uncertain network result; refresh the conversation first. Broad request-idempotency infrastructure is deferred. List responses evaluate all deadlines with one `as_of` time and expose separate `state`, `ever_breached`, `remaining_seconds`, and due times. A historical breach remains visible while paused or completed. The default agent queue contains active tickets; an “All statuses” view includes completed history.

## Worked examples to preserve in tests

All times below are IST, with an empty holiday list unless stated otherwise.

| Example | Expected result |
| --- | --- |
| `MEDIUM`, Fri 2026-11-20 18:00 | Response Mon 11-23 13:30; resolution Wed 11-25 18:00; neither overdue Sunday |
| Same, with Mon 11-23 a synthetic holiday | Response Tue 11-24 13:30; resolution Thu 11-26 18:00 |
| `LOW`, Fri 11-20 18:00 | Response Mon 11-23 18:00; resolution Fri 11-27 18:00 |
| `HIGH`, Fri 11-20 18:00 | Response Mon 11-23 11:00; resolution Fri 18:30 |
| `HIGH`, Fri 11-20 18:30 | Effective start Mon 11-23 09:30; response Mon 11:30; resolution Mon 18:30 |
| `MEDIUM`, Mon 11-23 09:30; wait at 11:30; reply Wed 11-25 10:30 | 2 hours consumed; 25 remain; resumed resolution due Fri 11-27 17:30 |
| Wait Mon 11-23 11:30, no reply | Auto-close due Mon 11-30 11:30; reply exactly then is rejected |
| Same wait with Thu 11-26 a synthetic holiday | Auto-close due Tue 12-01 11:30 |
| `LOW`, Mon 11-23 09:30; change to `HIGH` Tue 11-24 10:30 | 10 hours consumed versus 9-hour high budget; immediate resolution breach; no new same-day allowance |
| `HIGH`, Mon 11-23 09:30; resolve 12:30; reopen Tue 11-24 10:30 | 3 hours consumed, 6 remain; resolution due Tue 16:30; first response unchanged |
| Resolved Mon 11-23 12:30 | Reopen accepted through Mon 11-30 12:30 inclusive; later requires new ticket |

See [12 — Test plan](12-TEST_PLAN.md) for boundary, confidentiality, concurrency, and audit verification.
