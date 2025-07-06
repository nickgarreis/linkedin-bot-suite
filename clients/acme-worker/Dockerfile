FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app
COPY ../../package*.json ./
COPY ../../pnpm-lock.yaml ./
RUN corepack enable && pnpm i --prod

COPY ../../packages ./packages
COPY ./run-worker.ts /app/run-worker.ts

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CMD ["node", "packages/bot-core/dist/run-worker.js"]
