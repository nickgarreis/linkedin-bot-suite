FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# 1) Manifest-Dateien
COPY ../../package*.json ./
COPY ../../pnpm-workspace.yaml ./          # <-- hinzu
COPY ../../pnpm-lock.yaml ./

# 2) Quellcode der Workspaces vor der Installation kopieren
COPY ../../packages ./packages
COPY clients/acme-worker/run-worker.ts /app/run-worker.ts

# 3) Abhängigkeiten als root installieren, dann zurückwechseln
USER root
RUN npm install -g pnpm@8 --unsafe-perm \
 && pnpm install --prod \
 && npm install -g ts-node typescript
USER pptruser

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CMD ["pnpm","exec","ts-node","clients/acme-worker/run-worker.ts"]
