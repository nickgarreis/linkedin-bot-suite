FROM node:18-alpine

# Install pnpm and necessary packages for Puppeteer
RUN npm install -g pnpm && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/bot-core/package.json ./packages/bot-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/linkedin/package.json ./packages/linkedin/
COPY clients/acme-worker/package.json ./clients/acme-worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY clients/ ./clients/
COPY tsconfig.json ./

# Build all packages
RUN pnpm run build

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change to nodejs user
USER nodejs

# Start the worker
CMD ["pnpm", "--filter", "acme-worker", "start"]