FROM node:24-slim

WORKDIR /app

ENV API_PORT=18787

COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
COPY scripts/fetch-builtin-tts-model.mjs scripts/

RUN cd packages/shared && npm install --omit=dev && \
    cd /app/packages/config && npm install --omit=dev && \
    cd /app/apps/api && npm install --omit=dev

RUN node scripts/fetch-builtin-tts-model.mjs --output-dir /app/models

COPY packages/shared/ packages/shared/
COPY packages/config/ packages/config/
COPY apps/api/ apps/api/

EXPOSE 18787

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:18787/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
