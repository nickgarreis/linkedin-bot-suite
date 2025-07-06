FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# Manifest-Dateien
COPY ../../package*.json ./
COPY ../../pnpm-workspace.yaml ./
COPY ../../pnpm-lock.yaml ./

# Workspace-Quellcode
COPY ../../packages ./packages
COPY clients/acme-worker/run-worker.ts clients/acme-worker/run-worker.ts

# Abhängigkeiten (als root) → zurück zu pptruser
USER root
RUN npm install -g pnpm@8 --unsafe-perm \
 && pnpm install --prod \
 && npm install -g ts-node typescript
USER pptruser

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CMD ["node","--loader","ts-node/esm","clients/acme-worker/run-worker.ts"]
