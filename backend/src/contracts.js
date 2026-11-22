import { z } from 'zod';
export const priority = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export const status = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']);
export const uuid = z.uuid();
export const version = z.number().int().positive().max(2147483647);
export const bodyText = z.string().trim().min(1).max(10000);
export const empty = z.strictObject({});
export const login = z.strictObject({
  username: z.string().trim().toLowerCase().min(1).max(150),
  password: z.string().min(1).max(128),
});
export const createTicket = z.strictObject({
  subject: z.string().trim().min(1).max(160),
  description: bodyText,
  priority: priority.default('MEDIUM'),
});
export const commands = {
  claim: z.strictObject({ expected_version: version }),
  replies: z.strictObject({
    expected_version: version,
    body: bodyText,
    action: z.enum(['reply', 'wait', 'resolve']),
  }),
  notes: z.strictObject({ expected_version: version, body: bodyText }),
  priority: z.strictObject({
    expected_version: version,
    priority,
    reason: z.string().trim().min(1).max(500),
  }),
  customerReply: z.strictObject({ body: bodyText }),
  reopen: z.strictObject({ body: bodyText }),
};
const pageNumber = (fallback, max = 1000000) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(max))
    .default(fallback);
export const listQuery = z.strictObject({
  scope: z.enum(['mine', 'unassigned', 'all']).default('mine'),
  status: z.union([status, z.enum(['active', 'all'])]).default('active'),
  priority: priority.optional(),
  sla: z.enum(['all', 'breached']).default('all'),
  page: pageNumber(1),
  page_size: pageNumber(25, 100),
});
export const publicListQuery = z.strictObject({
  status: z.union([status, z.literal('all')]).default('all'),
  page: pageNumber(1),
  page_size: pageNumber(25, 100),
});
export const entriesQuery = z.strictObject({
  cursor: z.string().max(300).optional(),
  limit: pageNumber(50, 100),
});
export const auditId = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
export const auditQuery = z.strictObject({
  after_id: auditId.default('0'),
  limit: pageNumber(50, 100),
});
export const iso = z.iso.datetime({ precision: 3 });
export const identity = z.strictObject({
  id: uuid,
  display_name: z.string(),
  role: z.enum(['AGENT', 'CUSTOMER']),
});
