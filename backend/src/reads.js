import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { databaseTime } from './db.js';
import { ticketInclude } from './tickets.js';
import { ticketDTO, entryDTO, auditDTO } from './projections.js';
import { DomainError } from './errors.js';
import { iso, uuid } from './contracts.js';
const cursorSchema = z.strictObject({ at: iso, id: uuid });
export async function scopedTicket(db, id, user) {
  const ticket = await db.ticket.findFirst({
    where: { id, ...(user.role === 'CUSTOMER' ? { customerId: user.id } : {}) },
    include: ticketInclude,
  });
  if (!ticket) throw new DomainError(404, 'NOT_FOUND');
  return ticket;
}
export function createReads(db, clock = databaseTime) {
  async function list(user, q) {
    const now = await clock(db),
      where = [];
    const staff = user.role === 'AGENT';
    if (!staff) where.push(Prisma.sql`customer_id=${user.id}::uuid`);
    else if (q.scope === 'mine') where.push(Prisma.sql`assignee_id=${user.id}::uuid`);
    else if (q.scope === 'unassigned') where.push(Prisma.sql`assignee_id IS NULL`);
    if (q.status === 'active')
      where.push(Prisma.sql`status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER')`);
    else if (q.status !== 'all') where.push(Prisma.sql`status=${q.status}`);
    if (q.priority) where.push(Prisma.sql`priority=${q.priority}`);
    const breached = Prisma.sql`(first_response_breached_at IS NOT NULL OR resolution_breached_at IS NOT NULL OR (first_response_at IS NULL AND first_response_due_at<${now}) OR (resolution_running_since IS NOT NULL AND resolution_due_at<${now}) OR (status='WAITING_CUSTOMER' AND resolution_consumed_ms>resolution_budget_ms))`;
    if (q.sla === 'breached') where.push(breached);
    const filter = where.length ? Prisma.join(where, ' AND ') : Prisma.sql`TRUE`;
    const order = staff
      ? Prisma.sql`${breached} DESC, LEAST(CASE WHEN first_response_at IS NULL THEN first_response_due_at END,CASE WHEN resolution_running_since IS NOT NULL THEN resolution_due_at END) ASC NULLS LAST,created_at,id`
      : Prisma.sql`created_at DESC,id`;
    const { total, rows } = await db.$transaction(
      async (tx) => {
        const [count] = await tx.$queryRaw(
          Prisma.sql`SELECT count(*)::integer AS total FROM tickets WHERE ${filter}`,
        );
        const ids = await tx.$queryRaw(
          Prisma.sql`SELECT id FROM tickets WHERE ${filter} ORDER BY ${order} LIMIT ${q.page_size} OFFSET ${(q.page - 1) * q.page_size}`,
        );
        const tickets = await tx.ticket.findMany({
          where: { id: { in: ids.map((r) => r.id) } },
          include: ticketInclude,
        });
        const byId = new Map(tickets.map((t) => [t.id, t]));
        return { total: count.total, rows: ids.map((r) => byId.get(r.id)) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map((t) => ticketDTO(t, user, now, false)),
      pagination: {
        total,
        page: q.page,
        page_size: q.page_size,
        has_next: q.page * q.page_size < total,
      },
      as_of: now.toISOString(),
    };
  }
  async function detail(id, user) {
    const t = await scopedTicket(db, id, user);
    const now = await clock(db);
    return { data: ticketDTO(t, user, now) };
  }
  async function entries(id, user, q) {
    await scopedTicket(db, id, user);
    const staff = user.role === 'AGENT';
    let cursor;
    if (q.cursor)
      try {
        if (!/^[\w-]+$/.test(q.cursor)) throw new Error();
        cursor = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
      } catch {
        throw new DomainError(400, 'INVALID_INPUT');
      }
    const rows = await db.entry.findMany({
      where: {
        ticketId: id,
        ...(!staff ? { kind: 'PUBLIC_REPLY' } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.at) } },
                { createdAt: new Date(cursor.at), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit),
      last = page.at(-1);
    return {
      data: page.map((e) => entryDTO(e, staff)),
      pagination: {
        next_cursor:
          rows.length > q.limit
            ? Buffer.from(
                JSON.stringify({ at: last.createdAt.toISOString(), id: last.id }),
              ).toString('base64url')
            : null,
      },
      as_of: (await clock(db)).toISOString(),
    };
  }
  async function audit(id, user, q) {
    await scopedTicket(db, id, user);
    const rows = await db.auditEvent.findMany({
      where: { ticketId: id, id: { gt: BigInt(q.after_id) } },
      orderBy: { id: 'asc' },
      take: q.limit + 1,
    });
    return {
      data: rows.slice(0, q.limit).map(auditDTO),
      pagination: { next_after_id: rows.length > q.limit ? rows[q.limit - 1].id.toString() : null },
      as_of: (await clock(db)).toISOString(),
    };
  }
  return { list, detail, entries, audit };
}
