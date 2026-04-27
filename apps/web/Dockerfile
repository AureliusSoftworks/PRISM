FROM node:24-slim AS builder

WORKDIR /app/apps/web

# Honor the LOCAL-first privacy posture: disable Next.js anonymous
# telemetry at both build and runtime so nothing phones home to
# telemetry.nextjs.org.
ENV NEXT_TELEMETRY_DISABLED=1

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ .

ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=18788
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

EXPOSE 18788

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:18788').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
