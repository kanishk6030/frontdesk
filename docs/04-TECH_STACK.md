# 04 — Technology stack

Status: approved design baseline; Phase 2 explicitly authorized on 2026-11-21. Execution evidence is recorded in [16 — Implementation log](16-IMPLEMENTATION_LOG.md).

The [assignment PDF](../refrence/Hiring%20Test%20-%20Full%20Stack%20Developer.pdf), §5, permits Node on the backend and PostgreSQL. The user's override now fixes the choices within those allowances. This document supersedes the previous stack proposal.

## Approved components and compatibility baseline

Local development and integration tests now use the official `postgres:17` Docker image through root `docker-compose.yml` (explicit Phase 2 infrastructure decision). Prisma runs in Node, outside the database container. Development and test databases have distinct owner/runtime users. Hosted PostgreSQL remains the production choice.

| Layer | Selected technology | Responsibility |
| --- | --- | --- |
| Frontend | React 19, JavaScript/JSX, Vite 7 | Client-side agent and customer screens; production static build |
| Styling | Tailwind CSS 4 and its Vite plugin | Utility styling, responsive layout, focus/error/status states |
| Routing | React Router 7, declarative mode | BrowserRouter, role-specific routes, navigation, deep links; no framework-mode code generation |
| Server data in UI | TanStack Query 5 | Fetching, loading/errors, identity-scoped caches, explicit invalidation after writes |
| Runtime | Node.js 24 LTS, npm | Frontend tooling and backend execution; project packages use ES modules |
| Backend | Express.js 5, JavaScript | JSON routing, middleware, auth, domain commands, error mapping |
| Validation | Zod 4 in JavaScript modules | Strict request/query/environment schemas, safe DTO contracts, explicit runtime checks |
| Database | PostgreSQL 17 | Transactions, row locks, constraints, durable state and immutable evidence |
| ORM | prisma 7.0.0, @prisma/client 7.0.0, @prisma/adapter-pg 7.0.0 | Exact compatibility pins without ranges; schema, queries, transactions and migrations; JS configuration below |
| Database driver | @prisma/adapter-pg and pg | Prisma's PostgreSQL connection; pg also supports the session store and runtime-role checks |
| Authentication | express-session, connect-pg-simple, argon2, csrf-sync | PostgreSQL-backed sessions, Argon2id hashes, session-bound CSRF tokens |
| HTTP hardening | Helmet, express-rate-limit | Safe headers and bounded login attempts; no separate gateway |
| Time arithmetic | Luxon 3 plus exact integer milliseconds | Explicit Asia/Kolkata calendar operations; no festival-calendar service |
| Tests | Vitest 4, Supertest 7, real PostgreSQL | JavaScript unit/contract tests, HTTP tests, transaction and permission integration tests |
| Frontend hosting | Vercel | Vite static output and an uncached external `/api` rewrite |
| Backend hosting | Render; Railway is an allowed alternative | One Node/Express service; no backend application compilation |
| Data hosting | Hosted PostgreSQL, preferably beside the backend | Separate migration owner and restricted runtime role |
| Maintenance | GitHub Actions scheduled POST every five minutes | Durable cutoff sweep; same service also enforces cutoffs on writes |

Major versions are a compatibility baseline, not a claim that all are newest. The three Prisma packages are explicitly pinned to 7.0.0; pin pg to 8.16.3, the driver version used by that adapter release. Resolve exact patches for remaining libraries and commit lockfiles during P-01. Verify runtime generation, dependency health and Node/Vite compatibility before building features; changing a pin requires updating this baseline and rerunning compatibility checks, never adding a compiler or switching a required library silently.

## JavaScript-only source and configuration

Application, test, seed, maintenance, and tool configuration source uses `.js`; React components use `.jsx`. Both frontend and backend packages declare ES modules, and local Node imports include explicit `.js` extensions. Use `vite.config.js`, `vitest.config.js`, `eslint.config.js`, and `prisma.config.js` if those files are needed. SQL migrations, `schema.prisma`, JSON manifests, and CSS are data/configuration artifacts, not an application-language change.

Do not add TypeScript, TSX, `.ts`/`.tsx` source, `tsconfig` files, TypeScript compiler steps, `tsx`/`ts-node` runners, or language-specific type-generation tooling. Vite transforms JSX and bundles browser assets; Node executes backend JavaScript directly. JavaScript linting, strict Zod parsing, module boundaries, and automated tests replace static compilation checks.

## Prisma configuration without application compilation

Select Prisma 7's `prisma-client-js` generator and import its runtime through `@prisma/client` from backend ES modules. Keep generated client artifacts in dependency output, outside application source and the frontend bundle. Use JavaScript `prisma.config.js`, `schema.prisma`, matching `@prisma/adapter-pg`, and SQL migration files. Do not run an unreviewed initializer that produces prohibited source/configuration files.

Pinned configuration contract: prisma/@prisma/client/@prisma/adapter-pg **7.0.0**, pg **8.16.3**, Node **24.x**, PostgreSQL **17**; generator provider **prisma-client-js**, engineType **client**, default dependency output; `prisma.config.js` as an ES module; PostgreSQL PrismaPg adapter passed to PrismaClient. No generated client is imported by React. Prisma's shipped dependency declarations are not authored/compiled application source and require no project compiler. The 7.0.0 release source provides JavaScript client import exports and the adapter's ESM runtime; Prisma documents Node 24 support and optional static tooling. [Prisma 7.0.0 release](https://github.com/prisma/prisma/releases/tag/7.0.0), [client exports](https://raw.githubusercontent.com/prisma/prisma/7.0.0/packages/client/package.json), [adapter manifest](https://raw.githubusercontent.com/prisma/prisma/7.0.0/packages/adapter-pg/package.json), [runtime requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements).

The selected generator is deprecated but remains documented in Prisma 7; its replacement emits TypeScript source. Pinning this compatibility choice honors the user's JavaScript-only requirement. Treat generator retirement as an upgrade risk, not permission to introduce a compiler. Prisma configuration explicitly supports `.js`. [Prisma 7 generators](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [configuration extensions](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference#supported-file-extensions).

Use interactive `$transaction` and its transaction-scoped client for all command reads/writes. Lock with parameterized `$queryRaw` SQL where PostgreSQL features are not exposed as an ORM method. Check constraints, grants, partial indexes, and immutable-table triggers belong in reviewed custom SQL within Prisma migrations; do not assume schema generation supplies them. [Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [raw queries](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries).

## Runtime correctness in JavaScript

Zod strict objects reject unknown body fields instead of silently stripping them. Validate environment, route parameters, query strings, JSON bodies, and calendar snapshots. Response builders select allowed fields and validate the resulting audience-specific DTO before sending it. A failed response assertion is an internal error, never a reason to emit the raw Prisma object. [Zod schema API](https://zod.dev/api).

Use database-derived UTC time truncated to milliseconds, `timestamptz(3)`, integer millisecond durations, and explicit zone conversions. Audit bigint IDs cross JSON as decimal strings; versions are safe integers. Database duration BigInts are converted to domain Numbers only after safe-range checks. These representation decisions are A-31; ticket durations and lifecycle policy stay as defined in document 10.

Use small named ES modules for validation, commands, calendar functions, database access, public/staff projection, and Express routing. Avoid a generic CRUD layer that bypasses the command rules. In TanStack Query, keys include audience and user ID; cancel and clear the cache on logout/identity change. Disable mutation retries and refetch before deliberate resubmission.

## Frontend and hosting integration

Tailwind uses the Vite plugin; React Router uses ordinary JSX routes; TanStack Query owns remote state while component state owns unsent drafts. No SSR, route type generation, or extra client-state library is needed. [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [React Router declarative mode](https://reactrouter.com/start/declarative/installation), [TanStack Query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys).

Vercel serves React and forwards `/api/*` to the same path on Render/Railway before the SPA fallback. The browser uses relative API URLs, so session cookies remain first-party despite two deployments. Backend origin checks and CSRF still apply; no wildcard CORS or cross-site cookie workaround is part of this design. API/auth responses and external rewrites are explicitly uncached. [Vercel rewrites](https://vercel.com/docs/rewrites).

Free-tier backend sleep, scheduler delay, and database expiry remain release risks to verify. See [13 — Deployment](13-DEPLOYMENT.md). No Redis, separate worker service, external mail provider, chart library, or enterprise administration is added. Supporting auth/time/security packages above are narrowly scoped infrastructure, not changes to the approved stack.

## Verification

Phase 2 verification succeeded on Node 24.22.3 and Docker PostgreSQL 17.12: Prisma 7.0.0 schema validation, JavaScript client generation/import, development/test migrations, and restricted-role queries. Supporting package patches were updated within the approved families after audit: Vite 7.3.8, React Router 7.18.6, Vitest 4.1.12, Zod 4.6.7 and express-rate-limit 8.7.5. Lockfiles are authoritative. Playwright 1.57.0 drives local Edge smoke checks; Prettier formats JavaScript. Neither changes the application language or approved primary test stack.

The full pinned Prisma tooling tree reports 14 high-severity advisories. Prisma Client declares Prisma CLI as an optional peer, so a production prune must use **both** `--omit=dev --omit=optional` after client generation. The isolated pruned installation successfully imported/query-tested the client without the CLI; its selected dependency tree audits clean. Keep tooling local and review an eventual coordinated upgrade. Do not claim the full pinned development toolchain is vulnerability-free.

Vitest runs `.test.js` files; Supertest exercises the exported Express app without depending on a live listening port. PostgreSQL tests prove locking, rollback, privacy, and database grants using independent connections. Run JavaScript lint, runtime-schema/contract tests, Prisma validation/generation, and the Vite build; there is no type-compilation milestone. [Vitest guide](https://vitest.dev/guide/), [Supertest](https://github.com/forwardemail/supertest).

Official documentation was checked on 2026-11-21. No package has been installed or generated to validate these proposals during Phase 1; P-01 must establish the pinned compatibility baseline.
