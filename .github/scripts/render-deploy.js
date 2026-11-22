const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required deployment setting: ${name}`);
  return value;
};

const imageRef = required('IMAGE_REF');
if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$/.test(imageRef))
  throw new Error('IMAGE_REF must be an immutable GHCR sha256 digest reference.');

const hook = new URL(required('RENDER_DEPLOY_HOOK_URL'));
hook.searchParams.set('imgURL', imageRef);
const serviceId = required('RENDER_SERVICE_ID');
const apiKey = required('RENDER_API_KEY');
const healthUrl = new URL(required('HEALTH_URL'));
if (healthUrl.protocol !== 'https:') throw new Error('HEALTH_URL must use HTTPS.');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const deployResponse = await fetch(hook, { method: 'POST', redirect: 'error' });
if (deployResponse.status !== 200)
  throw new Error(`Render deploy hook returned ${deployResponse.status}; exact deploy was not started.`);
const deploy = await deployResponse.json();
const deployId = deploy.deploy?.id || deploy.id;
if (!deployId) throw new Error('Render did not return a deploy ID.');
console.log(`Render accepted deploy ${deployId} for the requested immutable digest.`);

const deadline = Date.now() + 15 * 60_000;
let live = false;
while (Date.now() < deadline) {
  await delay(10_000);
  const response = await fetch(
    `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`Render deploy status returned ${response.status}.`);
  const current = await response.json();
  const status = String(current.status || current.deploy?.status || '').toLowerCase();
  if (status === 'live') {
    live = true;
    break;
  }
  if (/failed|canceled|cancelled|deactivated/.test(status))
    throw new Error(`Render deploy ${deployId} ended with status ${status}.`);
}
if (!live) throw new Error(`Render deploy ${deployId} did not become live within 15 minutes.`);

let healthy = false;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await fetch(healthUrl, {
      headers: { 'User-Agent': 'frontdesk-release-health-check' },
      redirect: 'error',
    });
    if (response.ok) {
      healthy = true;
      break;
    }
  } catch {
    // A newly live service can take a short interval to accept traffic.
  }
  await delay(5_000);
}
if (!healthy) throw new Error('Post-deployment health check failed.');
console.log(`PASS: deploy ${deployId} is live and ${healthUrl.origin} passed its health check.`);
