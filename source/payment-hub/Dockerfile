# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:jobs

# One image, three processes: the Next app (default CMD), the BullMQ worker
# (node dist/worker.mjs) and the WebSocket relay (node dist/server.mjs).
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4000 \
    WS_PORT=4001 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
# Dispute evidence when no S3 endpoint is configured (STORAGE_LOCAL_DIR default ./storage)
# P7.5: uptime monitor state (compose volume monitor-data — a new named volume takes the owner
# of the image directory, so the nextjs user can write it)
RUN mkdir -p /app/storage /app/monitor && chown nextjs:nodejs /app/storage /app/monitor

USER nextjs
EXPOSE 4000 4001

CMD ["node", "server.js"]

# P7.5 — operations image: same app + bundles, plus the MariaDB client / openssl for
# scripts/backup.sh, restore.sh, backup-verify.sh and the daily scheduler (compose service
# "backup"). Build it explicitly (target ops); the app services use target runner.
FROM runner AS ops
USER root
RUN apk add --no-cache bash mariadb-client openssl tar tzdata coreutils \
    && mkdir -p /backups && chown nextjs:nodejs /backups
COPY --chown=nextjs:nodejs scripts/backup-lib.sh scripts/backup.sh scripts/restore.sh scripts/backup-verify.sh scripts/backup-cron.sh ./scripts/
ENV BACKUP_DIR=/backups TZ=Asia/Ho_Chi_Minh
USER nextjs
CMD ["bash", "scripts/backup-cron.sh"]
