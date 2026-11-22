import { timingSafeEqual } from 'node:crypto';
import {
  createTicket,
  commands,
  uuid,
  empty,
  listQuery,
  publicListQuery,
  entriesQuery,
  auditQuery,
} from './contracts.js';
import { DomainError } from './errors.js';
import { ticketDTO, entryDTO } from './projections.js';
import { createReads } from './reads.js';
export function ticketRoutes(db, service, clock) {
  const reads = createReads(db, clock);
  return (app) => {
    for (const [audience, role] of [
      ['agent', 'AGENT'],
      ['customer', 'CUSTOMER'],
    ]) {
      const base = `/api/${audience}/tickets`;
      app.use(`/api/${audience}`, (req, _res, next) =>
        req.user.role === role ? next() : next(new DomainError(403, 'FORBIDDEN')),
      );
      app.get(base, async (req, res) =>
        res.json(
          await reads.list(
            req.user,
            (role === 'AGENT' ? listQuery : publicListQuery).parse(req.query),
          ),
        ),
      );
      app.all(base + '/export', (_req, _res, next) => next(new DomainError(404, 'NOT_FOUND')));
      app.get(base + '/:id', async (req, res) => {
        empty.parse(req.query);
        res.json(await reads.detail(uuid.parse(req.params.id), req.user));
      });
      app.get(base + '/:id/entries', async (req, res) =>
        res.json(
          await reads.entries(uuid.parse(req.params.id), req.user, entriesQuery.parse(req.query)),
        ),
      );
      if (role === 'AGENT')
        app.get(base + '/:id/audit', async (req, res) =>
          res.json(
            await reads.audit(uuid.parse(req.params.id), req.user, auditQuery.parse(req.query)),
          ),
        );
      const map =
        role === 'AGENT'
          ? { claim: 'claim', replies: 'replies', notes: 'notes', priority: 'priority' }
          : { replies: 'customerReply', reopen: 'reopen' };
      for (const [route, kind] of Object.entries(map))
        app.post(base + '/:id/' + route, async (req, res) => {
          const result = await service.command(
            uuid.parse(req.params.id),
            req.user,
            kind,
            commands[kind].parse(req.body),
          );
          if (result.error) throw result.error;
          res.json({
            data: {
              ticket: ticketDTO(result.ticket, req.user, result.asOf),
              ...(result.entry ? { entry: entryDTO(result.entry, role === 'AGENT') } : {}),
            },
          });
        });
    }
    app.post('/api/customer/tickets', async (req, res) => {
      const result = await service.create(req.user, createTicket.parse(req.body));
      res.status(201).json({ data: { ticket: ticketDTO(result.ticket, req.user, result.asOf) } });
    });
  };
}
export function maintenanceRoute(service, config) {
  return (app) =>
    app.post('/api/internal/maintenance', async (req, res) => {
      const provided = Buffer.from(req.get('Authorization') || ''),
        expected = Buffer.from('Bearer ' + config.JOB_TOKEN);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
        throw new DomainError(401, 'JOB_AUTH_REQUIRED');
      empty.parse(req.body);
      res.json({ data: await service.maintenance() });
    });
}
