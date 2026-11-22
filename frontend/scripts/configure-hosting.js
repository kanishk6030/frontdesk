import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function hostingConfig(backendOrigin) {
  const origin = new URL(backendOrigin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== backendOrigin ||
    origin.username ||
    origin.password ||
    origin.hostname.endsWith('.invalid')
  )
    throw new Error(
      'Supply the actual HTTPS backend origin with no path, credentials or trailing slash.',
    );
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    rewrites: [
      { source: '/api/:path*', destination: origin.origin + '/api/:path*' },
      { source: '/:path*', destination: '/index.html' },
    ],
    headers: [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
    ],
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = hostingConfig(process.argv[2]);
  writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
  console.log(
    'Generated frontend/vercel.json. Review the real backend destination before deploying.',
  );
}
