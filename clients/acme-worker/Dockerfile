FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app
COPY ../../package*.json ./
COPY ../../pnpm-lock.yaml ./
RUN npm install -g pnpm@8 && pnpm install --prod

COPY ../../packages ./packages
COPY clients/acme-worker/run-worker.ts /app/run-worker.ts

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CMD ["node", "packages/bot-core/dist/run-worker.js"]
