import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const canary = 'PRIVATE-BROWSER-CANARY-' + Date.now(),
  subject = '[BROWSER TEST] Delivery issue ' + Date.now();
let publicResponses = [];
page.on('response', async (response) => {
  if (response.url().includes('/api/customer/')) {
    try {
      publicResponses.push(await response.text());
    } catch {
      /* Aborted navigation responses contain no usable payload. */
    }
  }
});
async function login(username, password, target = page) {
  await target.goto('http://localhost:5173/login');
  await target.getByLabel('Username', { exact: true }).fill(username);
  await target.getByLabel('Password', { exact: true }).fill(password);
  await target.getByRole('button', { name: 'Sign in →', exact: true }).click();
  await target.waitForURL(/\/(agent|customer)$/);
}
async function logout() {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
}
async function saved() {
  await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
}
try {
  await login('customer.maya', process.env.DEMO_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: '+ New ticket', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('Description', { exact: true }).fill('A synthetic browser walkthrough.');
  await page.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await page.waitForURL(/\/customer\/tickets\//);
  const id = page.url().split('/').at(-1);
  await logout();
  await login('agent.ava', process.env.DEMO_AGENT_PASSWORD);
  await page.getByRole('button', { name: 'Unassigned', exact: true }).click();
  await page.getByRole('link', { name: subject, exact: true }).click();
  await page.getByRole('button', { name: 'Take this ticket', exact: true }).click();
  await page.getByLabel('Internal note', { exact: true }).fill(canary);
  await page.getByRole('button', { name: 'Add internal note', exact: true }).click();
  await page.getByText(canary, { exact: true }).waitFor();
  await page.getByLabel('Public reply', { exact: true }).fill('Please send the order number.');
  await page.getByRole('button', { name: 'Send and wait', exact: true }).click();
  await page.getByText('Clock paused', { exact: true }).waitFor();
  await logout();
  await login('customer.maya', process.env.DEMO_CUSTOMER_PASSWORD);
  await page.goto('http://localhost:5173/customer/tickets/' + id);
  await page.getByText('Please send the order number.', { exact: true }).waitFor();
  assert.equal(await page.getByText(canary, { exact: true }).count(), 0);
  assert.ok(
    publicResponses.every((text) => !text.includes(canary) && !text.includes('INTERNAL_NOTE')),
  );
  await page.getByLabel('Public reply', { exact: true }).fill('Order 12345');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await page.locator('article.entry').filter({ hasText: 'Order 12345' }).waitFor();
  await saved();
  await logout();
  await login('agent.ava', process.env.DEMO_AGENT_PASSWORD);
  await page.goto('http://localhost:5173/agent/tickets/' + id);
  await page.getByLabel('Public reply', { exact: true }).fill('The order is fixed.');
  await page.getByRole('button', { name: 'Send and resolve', exact: true }).click();
  await saved();
  await page.getByText('Reopen through', { exact: true }).waitFor();
  await logout();
  await login('customer.maya', process.env.DEMO_CUSTOMER_PASSWORD);
  await page.goto('http://localhost:5173/customer/tickets/' + id);
  await page.getByLabel('Public reply', { exact: true }).fill('The issue persists.');
  await page.getByRole('button', { name: 'Reopen ticket', exact: true }).click();
  await page.locator('article.entry').filter({ hasText: 'The issue persists.' }).waitFor();
  await saved();
  await page.reload();
  await page.locator('article.entry').filter({ hasText: 'The issue persists.' }).waitFor();
  assert.equal(await page.getByText(canary, { exact: true }).count(), 0);
  await logout();
  await login('agent.ava', process.env.DEMO_AGENT_PASSWORD);
  await page.getByRole('link', { name: subject, exact: true }).waitFor();
  mkdirSync('../.local', { recursive: true });
  await page.screenshot({ path: '../.local/agent-queue.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/agent/tickets/' + id);
  await page.getByLabel('Public reply', { exact: true }).waitFor();
  await page.screenshot({ path: '../.local/mobile-detail.png', fullPage: true });
  await page.getByLabel('New priority', { exact: true }).selectOption('HIGH');
  await page.getByLabel('Reason', { exact: true }).fill('Browser verification of priority changes');
  await page.getByRole('button', { name: 'Update priority', exact: true }).click();
  await saved();
  await page.locator('.ticket-meta .badge-high').waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await logout();
  await login('customer.maya', process.env.DEMO_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: '+ New ticket', exact: true }).click();
  await page
    .getByLabel('Subject', { exact: true })
    .fill('[BROWSER TEST] Concurrent claim ' + Date.now());
  await page
    .getByLabel('Description', { exact: true })
    .fill('Two agents will contend for this synthetic ticket.');
  await page.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await page.waitForURL(/\/customer\/tickets\//);
  const raceId = page.url().split('/').at(-1);
  await logout();
  await login('agent.ava', process.env.DEMO_AGENT_PASSWORD);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await login('agent.ravi', process.env.DEMO_AGENT_PASSWORD, otherPage);
    await Promise.all(
      [page, otherPage].map((p) => p.goto('http://localhost:5173/agent/tickets/' + raceId)),
    );
    await Promise.all(
      [page, otherPage].map((p) =>
        p.getByRole('button', { name: 'Take this ticket', exact: true }).waitFor(),
      ),
    );
    const responses = [page, otherPage].map((p) =>
      p.waitForResponse((r) => r.url().endsWith('/claim') && r.request().method() === 'POST'),
    );
    await Promise.all(
      [page, otherPage].map((p) =>
        p.getByRole('button', { name: 'Take this ticket', exact: true }).click(),
      ),
    );
    const results = await Promise.all(responses);
    assert.deepEqual(results.map((r) => r.status()).sort(), [200, 409]);
    const loser = [page, otherPage][results.findIndex((r) => r.status() === 409)];
    await loser.getByRole('alert').filter({ hasText: 'Already claimed' }).waitFor();
    assert.equal(await loser.getByLabel('Public reply', { exact: true }).count(), 0);
  } finally {
    await otherContext.close();
  }
  assert.deepEqual(failures, []);
  assert.ok(publicResponses.every((text) => !text.includes(canary)));
  console.log(
    'PASS: real Edge login, create, concurrent claim with visible loser conflict, private note, wait, customer reply, resolve, reopen, priority, deep-link refresh, same-browser identity isolation, mobile render; no page exceptions.',
  );
} catch (error) {
  mkdirSync('../.local', { recursive: true });
  await page.screenshot({ path: '../.local/browser-failure.png', fullPage: true });
  console.error('Visible application errors:', await page.getByRole('alert').allTextContents());
  throw error;
} finally {
  await browser.close();
}
