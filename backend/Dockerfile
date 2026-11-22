# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS node-base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM node-base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM dependencies AS operator
COPY prisma.config.js ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
RUN npm run prisma:generate
USER node
CMD ["node", "scripts/docker-setup.js"]

FROM dependencies AS production-dependencies
COPY prisma.config.js ./
COPY prisma ./prisma
RUN npm run prisma:generate \
    && npm prune --omit=dev --omit=optional \
    && npm cache clean --force

FROM node-base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts/docker-start.js ./scripts/docker-start.js
COPY --chown=node:node src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/docker-start.js"]
