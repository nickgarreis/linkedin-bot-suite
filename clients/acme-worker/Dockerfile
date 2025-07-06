FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app
COPY ../../package*.json ./
COPY ../../pnpm-lock.yaml ./
USER root
RUN npm install -g pnpm@8 --unsafe-perm && pnpm install --prod
USER pptruser

COPY ../../packages ./packages
COPY clients/acme-worker/run-worker.ts /app/run-worker.ts

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CMD ["node", "packages/bot-core/dist/run-worker.js"]
