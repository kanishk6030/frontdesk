# CI/CD progress

- [x] Read repository rules, Docker/Compose files, package scripts, Prisma configuration, current workflow, and deployment documentation.
- [x] CI triggers only on pull requests and pushes to `main`; default token permissions are read-only.
- [x] CI uses Node 24 and PostgreSQL 17, separate owner/runtime roles, real PostgreSQL tests, Prisma validation/generation, lint, frontend tests/build, and linux/amd64 Docker builds.
- [x] Trusted `main` publishing is isolated in a job with `packages: write`; pull requests never authenticate for publishing.
- [x] Frontend/backend images use `sha-<commit>` tags and publish digest artifacts/summaries.
- [x] Manual backend release accepts only a previously published 40-character commit tag and resolves it to an immutable GHCR digest.
- [x] Production release uses a GitHub Environment; required reviewers must be configured in repository settings.
- [x] Backend release checks out the matching commit, runs `prisma migrate deploy`, reapplies runtime grants, and verifies restricted permissions before deployment. It never uses `db push`, reset, or seed.
- [x] Provider-independent resolution/migration logic is separate from `.github/scripts/render-deploy.js`.
- [x] Render backend adapter deploys the exact digest to an image-backed service, polls the deploy ID, and checks HTTPS health. The Compose-specific frontend image is not falsely offered as a standalone Render release.
- [x] YAML parsing, Node syntax checking, and isolated digest-pinned actionlint validation passed locally.
- [x] Disposable PostgreSQL 17 replay passed: Prisma validation/generation, both migration/grant paths, restricted-role verification, 36 backend tests, 2 frontend tests, both linters, JavaScript stack check, and Vite production build.
- [ ] Remote CI, GHCR publishing, Environment approval, Render deployment, and rollback remain unexecuted pending authorization and repository/provider configuration.
