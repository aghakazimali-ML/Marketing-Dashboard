# syntax=docker/dockerfile:1.7
# Multi-stage build; the runtime image is non-root. The database is PostgreSQL (see docker-compose.yml).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
# Placeholder values only satisfy build-time checks; real secrets are supplied at runtime.
ENV NEXT_TELEMETRY_DISABLED=1 AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# postgresql-client provides pg_dump / pg_restore for `npm run backup` and `npm run restore`.
RUN apt-get update && apt-get install -y --no-install-recommends curl tini postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /backups && chown -R node:node /backups /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Prisma CLI + scripts (migrations, backup, secret rotation) need the full production node_modules.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts /app/tsconfig.json ./
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER node
VOLUME ["/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server.js"]
