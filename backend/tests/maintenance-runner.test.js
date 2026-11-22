import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
async function run(responseBody, status = 200) {
  let calls = 0,
    authorized = true;
  const server = createServer((req, res) => {
    calls++;
    authorized = authorized && req.headers.authorization === 'Bearer test-runner-secret';
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: responseBody }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/run-maintenance.js'], {
        env: {
          ...process.env,
          FRONTDESK_BACKEND_URL: `http://127.0.0.1:${server.address().port}`,
          JOB_TOKEN: 'test-runner-secret',
        },
        stdio: 'ignore',
      });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    return { code, calls, authorized };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('T-JOB runner stops on completion, caps ten batches and reports endpoint errors', async () => {
  expect(
    await run({ processed: 1, closed: 1, breaches_recorded: 0, errors: 0, has_more: false }),
  ).toEqual({ code: 0, calls: 1, authorized: true });
  expect(
    await run({ processed: 100, closed: 0, breaches_recorded: 100, errors: 0, has_more: true }),
  ).toEqual({ code: 1, calls: 10, authorized: true });
  expect((await run({ errors: 1, has_more: false })).code).toBe(1);
  expect((await run({}, 503)).code).toBe(1);
});
