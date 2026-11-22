# 03 — User flows and edge cases

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

## F-01 — Sign in and enter the correct workspace

1. A seeded user opens `/login`; a relative `/api/auth/csrf` request through the Vercel proxy creates an anonymous session and returns a CSRF token. Submit username/password with `X-CSRF-Token`.
2. The server authenticates, rotates the session, and returns the role. Agent goes to `/agent`; customer to `/customer`.
3. Invalid credentials get a generic error. Unauthenticated data requests get 401. Expired sessions return to login without silently submitting saved messages.
4. Logout invalidates the session, cancels in-flight queries, clears the TanStack Query cache and drafts, and returns to login. Repeat this cleanup on identity change/session loss. A customer manually entering an agent URL still cannot obtain agent API data.

Inference I-01; proposed seeded-account mechanism A-01. There is no role selector that impersonates a real customer, signup, or password recovery flow.

## F-02 — Customer creates a problem

1. Customer chooses New ticket and enters subject, description, and HIGH/MEDIUM/LOW severity; MEDIUM is the default.
2. Server supplies identity, timestamps, status, and ownership; it captures the calendar and computes deadlines.
3. On success, show the new OPEN ticket and the original description. It appears in the agents' Unassigned queue.
4. Empty/oversized values or unknown fields receive field errors. A failed request creates neither a partial ticket nor orphan audit history. Disable repeated submission and refresh before retrying an uncertain result.

I-02/I-04; priority descriptions from §3. Intake starts SLAs immediately, including after-hours normalization and unassigned time.

## F-03 — Agent finds and claims work

1. Agent opens the queue, selects Mine, Unassigned, or All; optionally filters priority, status, breach, or customer waiting.
2. Agent opens an unassigned ticket and sees its public conversation and staff-only history.
3. Take this ticket submits the displayed staff version. The backend locks and claims the row transactionally.
4. The successful claimant sees the response and note tools. Another simultaneous claimant receives “Already claimed”; refresh shows the actual owner. That agent has read access but no write access.
5. A retry from the existing owner returns the same ticket without another claim event. No unclaim/reassignment control is offered.

R-17/R-18/R-22; INC-0291. Test this with two distinct signed-in agents, not two tabs sharing one session.

## F-04 — Respond or add an internal note

1. Owner reads ticket detail and the SLA panel.
2. Public Reply is clearly labeled “Visible to customer.” Submitting ordinary Reply appends an immutable public entry. If this is the first agent response, it freezes first-response timing/outcome.
3. Internal Note has a separate labeled composer and button. It appends an immutable internal entry, does not satisfy a response SLA, and does not change status or clocks.
4. The customer refreshes their own detail: public replies appear; notes, their counts, staff audit, and note metadata do not.
5. A stale staff version gets 409. Keep the typed draft, reload state, and require a deliberate resubmission; never move a note draft into the public composer.

R-19/R-20/R-23/R-24; INC-0304 and INC-0318. Text is plain text; no HTML execution. Nonowners cannot bypass disabled controls with direct requests. Owner may add notes on resolved/closed tickets, but public replies there require the appropriate customer reopen/new-ticket flow first.

## F-05 — Ask and wait for the customer

1. Owner chooses “Send and wait” from the public composer and supplies a real question.
2. In one transaction, publish the question, record first response if needed, checkpoint resolution work, set WAITING_CUSTOMER, and start 45 working hours of inactivity.
3. Queue shows “Waiting on customer,” paused remaining resolution allowance, and the auto-close deadline. Any historical breach remains visible.
4. Customer replies before the cutoff. Server publishes the reply, returns to IN_PROGRESS with the same owner, and calculates the resumed deadline from remaining resolution time.
5. Notes, agent follow-up replies, and priority changes while waiting do not extend the inactivity cutoff. Sending wait again is invalid. A future genuine question after a customer answer can begin a new wait.

R-14/R-15; A-16/A-17. An internal note cannot be used as the question. Weekend and holiday waiting consumes no inactivity working time and no resolution time.

## F-06 — Close after customer silence

1. A waiting ticket reaches its 45-hour working-time cutoff.
2. Scheduled maintenance locks and closes it once with CUSTOMER_TIMEOUT; a concurrent due-ticket mutation uses the same service.
3. Customer sees Closed — no customer response. It is not reported as a successful resolution.
4. A response processed at or after the cutoff is rejected, even if the scheduled job is delayed. The closure commits; the rejected message does not. UI refreshes and offers New ticket.
5. If a read happens before a delayed job records closure, show “Closure due”; GET does not mutate data. A before-cutoff reply accepted under the lock prevents closure.

R-15; A-18/A-19. No background processing depends on the agent keeping a page open. Job retry creates no duplicate event.

## F-07 — Resolve and reopen

1. Owner sends a public resolution using “Send and resolve” from IN_PROGRESS or WAITING_CUSTOMER.
2. Ticket becomes RESOLVED, its resolution clock stops, and the customer sees an explicit reopen deadline seven calendar days later.
3. Customer selects Reopen and supplies an explanation through that deadline, inclusive. Server records a public customer entry, returns to IN_PROGRESS, preserves owner/priority, and resumes remaining resolution allowance.
4. First-response history stays unchanged. Time spent resolved is excluded. A ticket that was already breached remains marked as such; a fully consumed allowance gives no fresh working day.
5. After the deadline, Reopen is unavailable and server rejects attempts with 409. New ticket opens a separate form, never silently duplicates the old ticket.
6. Each later resolution gives a new seven-day reopening window. A timeout CLOSED ticket always requires a new ticket.

R-16; A-20–A-22. Ordinary customer replies to RESOLVED are rejected with instructions to explicitly reopen. Agents cannot reopen on the customer's behalf.

## F-08 — Change priority without resetting elapsed work

1. Owner selects a new priority on an IN_PROGRESS or WAITING_CUSTOMER ticket and provides a reason.
2. Server checks the version, records any already-expired old deadline, checkpoints work, and applies the new original-ticket-based budget.
3. UI refreshes deadlines, remaining allowance, and breach evidence. Escalating an old ticket may immediately show a breach.
4. Waiting remains waiting, its inactivity cutoff remains fixed, and completed first-response evidence does not change.
5. Same-priority, stale, nonowner, or terminal-ticket commands are rejected. A downgrade cannot remove historical breach evidence.

R-21, §3's explicitly unanswered meeting question; policy A-23.

## F-09 — Explain a disputed response

1. Agent/lead opens ticket history.
2. Inspect creation, claim, public-response entry, actor, authoritative timestamp, applicable response deadline, and any wait/priority/resolution events.
3. A response accepted in forty minutes is distinguishable from one accepted the next morning. The evidence proves publication in this app, not delivery through an external mail system.
4. There are no edit/delete controls. API or runtime-database attempts to rewrite entries/history fail. Corrections are new entries.

R-08/R-24; INC-0318. The customer sees their public conversation, not staff audit data.

## Cross-flow edge cases

| Condition | Required outcome |
| --- | --- |
| Friday evening / weekend / holiday creation | Next working intervals determine targets; HIGH same-day interpretation is disclosed |
| Action exactly at response/resolution due time | On time; strictly later is overdue |
| Customer reply exactly at inactivity cutoff | Timeout closure wins |
| Customer reopen exactly at reopen cutoff | Reopen succeeds |
| Wait starts after a missed resolution deadline | Historical breach retained; pausing cannot erase it |
| First agent action is an internal note | Response still pending; no SLA satisfied |
| Customer B guesses customer A's ticket ID | 404; no ownership or content disclosure |
| Audit insert fails | Entire requested business mutation rolls back |
| Maintenance runs twice or overlaps a reply | Row lock and current-state recheck yield one legal result |
| Free host wakes after a missed run | Catch up due work with real recorded time and original effective cutoff |
| GET during expired wait before cleanup | Show closure pending; no hidden write |
| No tickets match filters | Useful empty state, no fabricated sample data |
| Lost network response to message POST | Refresh before any manual retry; do not automatically duplicate a message |

Acceptance tests for these paths are specified in [12 — Test plan](12-TEST_PLAN.md); planned task ownership is in [15 — Traceability](15-REQUIREMENTS_TRACEABILITY.md).
