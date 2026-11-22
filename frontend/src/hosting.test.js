import { expect, test } from 'vitest';
import { hostingConfig } from '../scripts/configure-hosting.js';
test('T-DEPLOY configuration: API rewrite precedes SPA, preserves API prefix, prevents caching', () => {
  const config = hostingConfig('https://test-backend.example.org');
  expect(config.rewrites[0]).toEqual({
    source: '/api/:path*',
    destination: 'https://test-backend.example.org/api/:path*',
  });
  expect(config.rewrites[1].destination).toBe('/index.html');
  expect(config.headers[0].headers.every((h) => h.value === 'no-store')).toBe(true);
  expect(() => hostingConfig('http://localhost:3000')).toThrow();
  expect(() => hostingConfig('https://backend.invalid')).toThrow();
});
