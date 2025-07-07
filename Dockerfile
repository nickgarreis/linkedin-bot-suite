FROM node:18-slim

# Install pnpm and basic dependencies
RUN npm install -g pnpm

# Install Chrome dependencies and Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libxss1 \
    libgconf-2-4 \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip installing Chromium. We'll be using Google Chrome.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/bot-core/package.json ./packages/bot-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/linkedin/package.json ./packages/linkedin/
COPY packages/worker/package.json ./packages/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build all packages
RUN pnpm run build

# Verify Chrome binary exists and is executable
RUN /usr/bin/google-chrome-stable --version

# Create a non-root user to run the application
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs nodejs

# Change to nodejs user
USER nodejs

# Start the worker
CMD ["pnpm", "--filter", "@linkedin-bot-suite/worker", "start"]