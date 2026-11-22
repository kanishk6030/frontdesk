const origin = process.env.FRONTDESK_BACKEND_URL,
  token = process.env.JOB_TOKEN;
if (!origin || !token) throw new Error('FRONTDESK_BACKEND_URL and JOB_TOKEN are required.');
for (let batch = 1; batch <= 10; batch++) {
  const response = await fetch(new URL('/api/internal/maintenance', origin), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error('Maintenance HTTP ' + response.status);
  const { data } = await response.json();
  console.log(
    JSON.stringify({
      batch,
      processed: data.processed,
      closed: data.closed,
      breaches_recorded: data.breaches_recorded,
      errors: data.errors,
      has_more: data.has_more,
    }),
  );
  if (data.errors) throw new Error('Maintenance reported processing errors');
  if (!data.has_more) break;
  if (batch === 10)
    throw new Error('Maintenance batch cap reached; remaining work requires a later run.');
}
