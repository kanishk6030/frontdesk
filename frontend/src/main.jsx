import React, { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useNavigate,
  useParams,
} from 'react-router';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api, resetToken, queryKey } from './api.js';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15000 }, mutations: { retry: false } },
});
const Auth = createContext(null);
const label = (value) =>
  value
    ?.replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(value)) + ' IST'
    : '—';
const hours = (seconds) => `${(seconds / 3600).toFixed(2)} working hours`;
function Badge({ value }) {
  return <span className={'badge badge-' + value?.toLowerCase()}>{label(value)}</span>;
}
function ErrorBox({ error }) {
  return error ? (
    <div role="alert" className="error">
      <strong>{error.code ? label(error.code) : 'Unable to complete request'}</strong>
      <p>{error.message}</p>
      {error.fields && <p>{Object.keys(error.fields).join(', ')}</p>}
      {error.status === 409 && (
        <p>The latest state has been loaded. Review it before deliberately submitting again.</p>
      )}
    </div>
  ) : null;
}
function WorkspaceLoading() {
  return (
    <div className="loading workspace-loading" role="status" aria-live="polite">
      <strong>Opening workspace…</strong>
      <span>Server waking up. Please wait.</span>
    </div>
  );
}
function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const expired = () => {
      client.cancelQueries();
      client.clear();
      setUser(null);
    };
    window.addEventListener('session-expired', expired);
    api('/auth/me')
      .then((result) => {
        if (active) setUser(result.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);
  async function changeUser(next) {
    await client.cancelQueries();
    client.clear();
    setUser(next);
  }
  return <Auth.Provider value={{ user, loading, changeUser }}>{children}</Auth.Provider>;
}
function Login() {
  const { user, loading, changeUser } = useContext(Auth),
    navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (values) => api('/auth/login', { method: 'POST', body: values }),
    onSuccess: async (result) => {
      await changeUser(result.data.user);
      navigate('/' + result.data.user.role.toLowerCase(), { replace: true });
    },
  });
  if (loading) return <WorkspaceLoading />;
  if (user) return <Navigate to={'/' + user.role.toLowerCase()} replace />;
  return (
    <div className="login-page">
      <section className="login-story">
        <Link className="brand" to="/login">
          <span className="brand-mark">f.</span>frontdesk
        </Link>
        <div>
          <span className="eyebrow">A clearer way to care</span>
          <h1>
            Every issue.
            <br />
            Someone on it.
          </h1>
          <p>A shared place for the conversation, the next step, and the time that matters.</p>
          <div className="story-rule" />
          <p className="small">One owner. Clear promises. A complete history.</p>
        </div>
        <span className="small">Support workspace · Working hours 09:30–18:30 IST</span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to Frontdesk</h2>
          <p className="muted">Use your assigned agent or customer account.</p>
          <ErrorBox error={mutation.error} />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)));
            }}
          >
            <label>
              Username
              <input name="username" autoComplete="username" required maxLength={150} />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button className="primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
          <p className="small muted">
            This workspace uses seeded demo accounts. Contact the project owner for access.
          </p>
        </div>
      </section>
    </div>
  );
}
function Protected({ role, children }) {
  const { user, loading } = useContext(Auth);
  if (loading) return <WorkspaceLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={'/' + user.role.toLowerCase()} replace />;
  return <Layout key={user.id}>{children}</Layout>;
}
function Layout({ children }) {
  const { user, changeUser } = useContext(Auth),
    navigate = useNavigate(),
    [error, setError] = useState(null);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
      resetToken();
      await changeUser(null);
      navigate('/login', { replace: true });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" to={'/' + user.role.toLowerCase()}>
          <span className="brand-mark">f.</span>frontdesk
        </Link>
        <p className="nav-label">
          {user.role === 'AGENT' ? 'SUPPORT WORKSPACE' : 'CUSTOMER PORTAL'}
        </p>
        <NavLink to={'/' + user.role.toLowerCase()} className="nav-item">
          <span>▤</span> {user.role === 'AGENT' ? 'Ticket queue' : 'Your tickets'}
        </NavLink>
        <div className="sidebar-bottom">
          <span className="avatar">{user.display_name.slice(0, 1)}</span>
          <div>
            <strong>{user.display_name}</strong>
            <span>{label(user.role)}</span>
          </div>
          <button className="text-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {user.role === 'AGENT' ? 'Support / Ticket workspace' : 'Support / Your conversations'}
          </span>
          <span className="work-hours">Mon–Fri · 09:30–18:30 IST</span>
        </header>
        <div className="page">
          <ErrorBox error={error} />
          {children}
        </div>
      </main>
    </div>
  );
}
function Queue() {
  const { user } = useContext(Auth),
    staff = user.role === 'AGENT';
  const [filters, setFilters] = useState(
      staff
        ? { scope: 'mine', status: 'active', sla: 'all', priority: '', page: 1 }
        : { status: 'all', page: 1 },
    ),
    [creating, setCreating] = useState(false);
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== ''));
  const query = useQuery({
    queryKey: queryKey(user, 'tickets', filters),
    queryFn: ({ signal }) => api(`/${user.role.toLowerCase()}/tickets?${params}`, { signal }),
  });
  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{staff ? 'YOUR DAY, IN FOCUS' : 'WE’RE HERE TO HELP'}</span>
          <h1>{staff ? 'Ticket queue' : 'Your tickets'}</h1>
          <p className="muted">
            {staff
              ? 'Pick up work, keep promises, and move conversations forward.'
              : 'A clear view of every issue you’ve raised.'}
          </p>
        </div>
        <div className="heading-actions">
          <button onClick={() => query.refetch()} disabled={query.isFetching}>
            ↻ Refresh
          </button>
          {!staff && (
            <button className="primary" onClick={() => setCreating((v) => !v)}>
              {creating ? 'Close form' : '+ New ticket'}
            </button>
          )}
        </div>
      </div>
      {creating && <NewTicket onDone={() => setCreating(false)} />}
      <section className="panel queue-panel">
        <div className="queue-toolbar">
          {staff && (
            <div className="tabs" aria-label="Queue scope">
              {['mine', 'unassigned', 'all'].map((scope) => (
                <button
                  key={scope}
                  aria-pressed={filters.scope === scope}
                  className={filters.scope === scope ? 'active' : ''}
                  onClick={() => update('scope', scope)}
                >
                  {label(scope)}
                </button>
              ))}
            </div>
          )}
          <span className="result-count">
            {query.data?.pagination.total ?? '—'} matching tickets
          </span>
        </div>
        <div className="filters">
          <label>
            Status
            <select value={filters.status} onChange={(e) => update('status', e.target.value)}>
              {(staff
                ? ['active', 'all', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']
                : ['all', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']
              ).map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          {staff && (
            <>
              <label>
                Priority
                <select
                  value={filters.priority}
                  onChange={(e) => update('priority', e.target.value)}
                >
                  <option value="">All priorities</option>
                  {['HIGH', 'MEDIUM', 'LOW'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                SLA
                <select value={filters.sla} onChange={(e) => update('sla', e.target.value)}>
                  <option value="all">All tickets</option>
                  <option value="breached">Current or past breach</option>
                </select>
              </label>
            </>
          )}
        </div>
        <ErrorBox error={query.error} />
        {query.isPending ? (
          <div className="empty">Loading your tickets…</div>
        ) : query.data?.data.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">✓</span>
            <h3>No tickets in this view</h3>
            <p>
              {staff
                ? 'Try Unassigned to pick up a new issue, or adjust your filters.'
                : 'Need a hand? Create a ticket to start a conversation.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>Priority</th>
                  {staff ? (
                    <>
                      <th>Assigned to</th>
                      <th>SLA</th>
                    </>
                  ) : (
                    <th>Created</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data?.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        className="ticket-link"
                        to={`/${user.role.toLowerCase()}/tickets/${t.id}`}
                      >
                        {t.subject}
                      </Link>
                      <span className="table-sub">
                        #{t.id.slice(0, 8)}
                        {staff ? ' · ' + t.customer.display_name : ''}
                      </span>
                    </td>
                    <td>
                      <Badge value={t.status} />
                      {t.closure_pending && <span className="danger table-sub">Closure due</span>}
                    </td>
                    <td>
                      <Badge value={t.priority} />
                    </td>
                    {staff ? (
                      <>
                        <td>
                          {t.assignee?.display_name || <span className="muted">Unassigned</span>}
                        </td>
                        <td>
                          <QueueSla sla={t.sla} />
                          {t.auto_close_due_at && (
                            <span className="table-sub">
                              Auto-close: {date(t.auto_close_due_at)}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td>{date(t.created_at)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Page {filters.page}
            {query.data?.as_of && (
              <span className="table-sub">Updated {date(query.data.as_of)}</span>
            )}
          </span>
          <div>
            <button
              disabled={filters.page === 1 || query.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </button>
            <button
              disabled={!query.data?.pagination.has_next || query.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
function QueueSla({ sla }) {
  return (
    <div className="queue-sla">
      {[
        ['Reply', sla.first_response],
        ['Resolution', sla.resolution],
      ].map(([name, metric]) => (
        <div key={name}>
          <span className={metric.ever_breached ? 'danger' : ''}>
            {name}: {label(metric.state)}
            {metric.ever_breached ? ' · breach recorded' : ''}
          </span>
          <span className="table-sub">
            {metric.state === 'PAUSED'
              ? hours(metric.remaining_seconds) + ' remaining'
              : date(metric.due_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
function NewTicket({ onDone }) {
  const { user } = useContext(Auth),
    cache = useQueryClient(),
    navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (body) => api('/customer/tickets', { method: 'POST', body }),
    onSuccess: (result) => {
      cache.invalidateQueries({ queryKey: queryKey(user, 'tickets') });
      onDone();
      navigate('/customer/tickets/' + result.data.ticket.id);
    },
  });
  return (
    <section className="panel new-ticket">
      <h2>Tell us what’s happening</h2>
      <ErrorBox error={mutation.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label>
          Subject
          <input
            name="subject"
            required
            maxLength={160}
            placeholder="A short summary of the issue"
          />
        </label>
        <label>
          How is this affecting you?
          <select name="priority" defaultValue="MEDIUM">
            <option value="HIGH">High — I cannot work at all</option>
            <option value="MEDIUM">Medium — My work is affected</option>
            <option value="LOW">Low — A question or small request</option>
          </select>
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={4}
            required
            maxLength={10000}
            placeholder="What happened, and what did you expect?"
          />
        </label>
        <button className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create ticket'}
        </button>
      </form>
    </section>
  );
}
function DetailRoute() {
  const { id } = useParams();
  return <TicketDetail key={id} id={id} />;
}
function TicketDetail({ id }) {
  const { user } = useContext(Auth),
    cache = useQueryClient(),
    staff = user.role === 'AGENT',
    prefix = `/${user.role.toLowerCase()}/tickets/${id}`;
  const detail = useQuery({
    queryKey: queryKey(user, 'ticket', id),
    queryFn: ({ signal }) => api(prefix, { signal }),
  });
  const entries = useInfiniteQuery({
    queryKey: queryKey(user, 'entries', id),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      api(prefix + '/entries' + (pageParam ? '?cursor=' + encodeURIComponent(pageParam) : ''), {
        signal,
      }),
    getNextPageParam: (page) => page.pagination.next_cursor || undefined,
  });
  const [reply, setReply] = useState(''),
    [note, setNote] = useState(''),
    [reason, setReason] = useState(''),
    [newPriority, setNewPriority] = useState('HIGH'),
    [notice, setNotice] = useState('');
  const refresh = () => cache.invalidateQueries({ queryKey: [user.role, user.id] });
  const mutation = useMutation({
    mutationFn: ({ route, body }) => api(prefix + '/' + route, { method: 'POST', body }),
    onSuccess: async (_result, variables) => {
      if (['replies', 'reopen'].includes(variables.route)) setReply('');
      if (variables.route === 'notes') setNote('');
      if (variables.route === 'priority') setReason('');
      await refresh();
      setNotice('Saved. The conversation is up to date.');
    },
    onError: async (error) => {
      setNotice('');
      if (error.status === 409) await refresh();
    },
  });
  const t = detail.data?.data;
  if (detail.isPending) return <div className="loading">Loading conversation…</div>;
  if (!t)
    return (
      <>
        <Link to={'/' + user.role.toLowerCase()}>← Back to tickets</Link>
        <ErrorBox error={detail.error} />
      </>
    );
  const allowed = t.allowed_actions || [];
  const submit = (route, body = {}) =>
    mutation.mutate({
      route,
      body: { ...(staff ? { expected_version: t.version } : {}), ...body },
    });
  return (
    <>
      <Link className="back-link" to={'/' + user.role.toLowerCase()}>
        ← Back to tickets
      </Link>
      <div className="page-heading detail-heading">
        <div>
          <span className="eyebrow">TICKET #{id.slice(0, 8)}</span>
          <h1>{t.subject}</h1>
          <div className="ticket-meta">
            <Badge value={t.status} />
            <Badge value={t.priority} />
            <span>Created {date(t.created_at)}</span>
          </div>
        </div>
        <button onClick={refresh} disabled={detail.isFetching}>
          ↻ Refresh
        </button>
      </div>
      <ErrorBox error={mutation.error} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {t.closure_pending && (
        <div className="warning">
          Closure is due because the customer reply window has expired. The next maintenance run
          will record closure.
        </div>
      )}
      <div className="detail-grid">
        <div className="conversation">
          <section className="panel conversation-panel">
            <div className="section-heading">
              <h2>Conversation</h2>
              <span className="muted small">
                {staff ? 'Public replies & team notes' : 'Visible to you and support'}
              </span>
            </div>
            <article className="entry original">
              <div className="entry-heading">
                <strong>
                  {staff ? t.customer.display_name : 'You'}{' '}
                  <span className="muted small">· Original request</span>
                </strong>
                <time>{date(t.created_at)}</time>
              </div>
              <p>{t.description}</p>
            </article>
            <ErrorBox error={entries.error} />
            {entries.isPending && <p className="muted">Loading messages…</p>}
            {entries.data?.pages
              .flatMap((page) => page.data)
              .map((entry) => (
                <article
                  key={entry.id}
                  className={'entry ' + (entry.kind === 'INTERNAL_NOTE' ? 'internal' : '')}
                >
                  <div className="entry-heading">
                    <strong>
                      {entry.author.display_name}
                      <span className="muted small"> · {label(entry.author.role)}</span>
                    </strong>
                    <time>{date(entry.created_at)}</time>
                  </div>
                  {entry.kind === 'INTERNAL_NOTE' && (
                    <div className="note-label">Internal note — team only</div>
                  )}
                  <p>{entry.body}</p>
                </article>
              ))}
            {entries.hasNextPage && (
              <button onClick={() => entries.fetchNextPage()} disabled={entries.isFetchingNextPage}>
                Load more messages
              </button>
            )}
          </section>
          {(staff ? allowed.includes('reply') : t.can_reply || t.can_reopen) && (
            <section className="panel composer">
              <h2>{t.can_reopen ? 'Reopen with an explanation' : 'Public reply'}</h2>
              <p className="small muted">
                {staff
                  ? 'Visible to the customer. Sending and waiting pauses resolution and starts the customer reply window.'
                  : 'Your message will be visible to the support team.'}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const action = e.nativeEvent.submitter?.value || 'reply';
                  submit(t.can_reopen ? 'reopen' : 'replies', {
                    body: reply,
                    ...(staff ? { action } : {}),
                  });
                }}
              >
                <label className="sr-only" htmlFor="public-reply">
                  Public reply
                </label>
                <textarea
                  id="public-reply"
                  rows={5}
                  required
                  maxLength={10000}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    t.can_reopen ? 'Tell us what still needs attention…' : 'Write your reply…'
                  }
                />
                <div className="composer-actions">
                  <button className="primary" value="reply" disabled={mutation.isPending}>
                    {t.can_reopen ? 'Reopen ticket' : 'Send reply'}
                  </button>
                  {staff && allowed.includes('wait') && (
                    <button value="wait" disabled={mutation.isPending}>
                      Send and wait
                    </button>
                  )}
                  {staff && allowed.includes('resolve') && (
                    <button value="resolve" disabled={mutation.isPending}>
                      Send and resolve
                    </button>
                  )}
                </div>
              </form>
            </section>
          )}
          {staff && allowed.includes('note') && (
            <section className="panel composer note-composer">
              <h2>Internal note</h2>
              <p className="small">
                Only support agents can see this. Notes do not satisfy a response SLA.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit('notes', { body: note });
                }}
              >
                <label className="sr-only" htmlFor="private-note">
                  Internal note
                </label>
                <textarea
                  id="private-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  maxLength={10000}
                  rows={3}
                  placeholder="Add context for the team…"
                />
                <button disabled={mutation.isPending}>Add internal note</button>
              </form>
            </section>
          )}
          {staff && <Audit id={id} user={user} />}
        </div>
        <aside className="ticket-sidebar">
          <section className="panel">
            <h2>Ticket details</h2>
            {staff && (
              <>
                <p className="field-label">Assigned to</p>
                <p>{t.assignee?.display_name || 'Unassigned'}</p>
                {allowed.includes('claim') && (
                  <button
                    className="primary full-width"
                    disabled={mutation.isPending}
                    onClick={() => submit('claim')}
                  >
                    Take this ticket
                  </button>
                )}
                {t.assignee && t.assignee.id !== user.id && (
                  <p className="small muted">
                    You can read this ticket. Only its owner can update it.
                  </p>
                )}
              </>
            )}
            {t.auto_close_due_at && (
              <>
                <p className="field-label">Customer reply needed by</p>
                <p>{date(t.auto_close_due_at)}</p>
              </>
            )}
            {t.resolved_at && (
              <>
                <p className="field-label">Resolved</p>
                <p>{date(t.resolved_at)}</p>
                <p className="field-label">Reopen through</p>
                <p>{date(t.reopen_until)}</p>
              </>
            )}
            {t.closed_at && (
              <>
                <p className="field-label">Closed</p>
                <p>{date(t.closed_at)}</p>
                <p className="small">
                  Closed because no customer response was received. This does not mean the issue was
                  fixed.
                </p>
              </>
            )}
            {!staff && !t.can_reply && !t.can_reopen && (
              <Link className="button-link" to="/customer">
                Create a new ticket →
              </Link>
            )}
          </section>
          {staff && (
            <section className="panel sla-panel">
              <h2>Service commitments</h2>
              {[
                ['First response', t.sla.first_response],
                ['Resolution', t.sla.resolution],
              ].map(([name, metric]) => (
                <div className="sla-metric" key={name}>
                  <div>
                    <strong>{name}</strong>
                    <Badge value={metric.state} />
                  </div>
                  <p>
                    {metric.due_at
                      ? date(metric.due_at)
                      : metric.state === 'PAUSED'
                        ? 'Clock paused'
                        : metric.state === 'CANCELLED'
                          ? 'Cancelled after customer silence'
                          : 'Completed from a paused clock'}
                  </p>
                  <span className="small muted">{hours(metric.remaining_seconds)} remaining</span>
                  {metric.ever_breached && (
                    <p className="danger small">A breach is retained in the history.</p>
                  )}
                </div>
              ))}
              <p className="small muted">
                HIGH resolution: end of the arrival working day. Calendar: weekdays, 09:30–18:30
                IST.{' '}
                {t.calendar.holidays.length === 0
                  ? 'Demo holiday list is empty.'
                  : t.calendar.holidays.length + ' excluded holiday dates.'}
              </p>
              <span className="small muted">As of {date(t.sla.as_of)}</span>
            </section>
          )}
          {staff && allowed.includes('priority') && (
            <section className="panel">
              <h2>Change priority</h2>
              <p className="small muted">
                Elapsed work is retained. A tighter target may immediately breach.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit('priority', { priority: newPriority, reason });
                }}
              >
                <label>
                  New priority
                  <select
                    aria-label="New priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    {['HIGH', 'MEDIUM', 'LOW'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    required
                    rows={3}
                  />
                </label>
                <button disabled={mutation.isPending || newPriority === t.priority}>
                  Update priority
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function Audit({ id, user }) {
  const query = useInfiniteQuery({
    queryKey: queryKey(user, 'audit', id),
    initialPageParam: '0',
    queryFn: ({ pageParam, signal }) =>
      api(`/agent/tickets/${id}/audit?after_id=${pageParam}`, { signal }),
    getNextPageParam: (page) => page.pagination.next_after_id || undefined,
  });
  return (
    <section className="panel audit-panel">
      <div className="section-heading">
        <h2>Activity history</h2>
        <span className="small muted">Append-only evidence · team only</span>
      </div>
      <ErrorBox error={query.error} />
      {query.data?.pages
        .flatMap((p) => p.data)
        .map((event) => (
          <details className="audit-event" key={event.id}>
            <summary>
              <span>
                <strong>{label(event.event_type)}</strong>
                <span className="table-sub">
                  {event.actor.display_name} · {date(event.occurred_at)}
                </span>
              </span>
              <span className="muted">+</span>
            </summary>
            <p className="small">
              Effective: {date(event.effective_at)}
              <br />
              Recorded: {date(event.recorded_at)}
            </p>
            {event.data.reason && <p>{event.data.reason}</p>}
            <pre>{JSON.stringify(event.data, null, 2)}</pre>
          </details>
        ))}
      {query.hasNextPage && (
        <button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          Load more history
        </button>
      )}
    </section>
  );
}
function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            {[
              ['agent', 'AGENT'],
              ['customer', 'CUSTOMER'],
            ].flatMap(([path, role]) => [
              <Route
                key={path}
                path={'/' + path}
                element={
                  <Protected role={role}>
                    <Queue />
                  </Protected>
                }
              />,
              <Route
                key={path + '-detail'}
                path={`/${path}/tickets/:id`}
                element={
                  <Protected role={role}>
                    <DetailRoute />
                  </Protected>
                }
              />,
            ])}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
