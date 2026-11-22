import { z } from 'zod';
const schema = z.strictObject({
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v)),
  SESSION_SECRET: z.string().min(32),
  JOB_TOKEN: z.string().min(32),
  APP_ORIGIN: z.url().refine((v) => new URL(v).origin === v),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  FRONTDESK_HOLIDAYS: z.string().default('[]'),
});
export function readConfig(env = process.env) {
  const parsed = schema.safeParse(
    Object.fromEntries(Object.keys(schema.shape).map((k) => [k, env[k]])),
  );
  if (!parsed.success)
    throw new Error(
      'Invalid environment fields: ' + parsed.error.issues.map((i) => i.path.join('.')).join(', '),
    );
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.APP_ORIGIN.startsWith('https://'))
    throw new Error('Production APP_ORIGIN must use HTTPS');
  return parsed.data;
}
