# Dockerization progress

## Checkpoints

- [x] Read repository rules, Compose baseline, package scripts, Prisma configuration, runtime configuration, and relevant deployment documentation.
- [x] Design: Nginx is the only published service; backend and PostgreSQL use an internal bridge network; database data uses the existing named volume.
- [x] Add multi-stage frontend and backend images, non-root runtimes, health checks, SPA fallback, and `/api` proxy.
- [x] Add an explicit one-shot operator image for role provisioning, Prisma migration deployment, restricted grants, and optional demo seed. Owner credentials are not passed to the backend service.
- [x] Build images. Initial Prisma OpenSSL warning was fixed by adding OpenSSL/CA certificates; the clean rebuild generated Prisma Client without that warning.
- [x] Run explicit database setup against the preserved volume: separate roles preserved, two migrations current, runtime grants applied, demo data preserved.
- [x] Start and verify all three container health checks.
- [x] Verify Nginx `/api` and SPA routing. The first Nginx build exposed a missing `root` directive through a real 500; it was corrected and rebuilt.
- [x] Run the existing Edge smoke journey against `http://localhost:8080`: login, create, concurrent claim conflict, private note isolation, wait/resume, resolve/reopen, priority, audit UI, deep-link refresh, identity isolation, and mobile rendering passed.
- [x] Restart PostgreSQL/backend/frontend: ticket count remained 16, all services returned healthy, and post-restart CSRF/login/session requests returned HTTP 200.
- [x] Verify boundaries: frontend alone publishes `127.0.0.1:8080`; backend/PostgreSQL expose container ports only; backend user is `node`; frontend user is UID 101; runtime identity is `frontdesk_runtime`.
- [x] Finalize README and actual results.

## Safety boundaries

- Never run `prisma db push`, `migrate reset`, destructive reseeding, or `docker compose down -v`.
- `db-setup` is an explicit operator command; migrations and grants never run in backend startup.
- The backend service receives only the restricted runtime database URL.

## Actual limitation

The operator step was verified idempotently against the existing preserved named volume. A completely empty-volume bootstrap was not executed because deleting or replacing the user's persistent database was outside the authorized non-destructive scope.
