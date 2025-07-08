FROM node:18-slim

# Install specific pnpm version and basic dependencies
RUN npm install -g pnpm@10.12.4

# Install Chrome dependencies, network tools, and Google Chrome
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
    # Additional stability packages
    libglib2.0-0 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    # Network debugging and DNS tools
    dnsutils \
    iputils-ping \
    net-tools \
    curl \
    # Process management
    dumb-init \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# DNS configuration removed - containers inherit DNS from host

# Create necessary directories with proper permissions
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Tell Puppeteer to skip installing Chromium. We'll be using Google Chrome.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    CHROME_DEVEL_SANDBOX=/usr/bin/google-chrome-stable \
    CHROME_USER_DATA_DIR=/tmp/chrome-user-data \
    DISPLAY=:99 \
    DBUS_SESSION_BUS_ADDRESS=/dev/null

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api-server/package.json ./packages/api-server/
COPY packages/bot-core/package.json ./packages/bot-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/linkedin/package.json ./packages/linkedin/
COPY packages/worker/package.json ./packages/worker/

# Install dependencies with robust error handling
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build all packages
RUN pnpm run build:clean && pnpm run build

# Verify Chrome binary exists and is executable
RUN /usr/bin/google-chrome-stable --version

# Create a non-root user to run the application
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs -m -d /home/nodejs nodejs

# Create Chrome directories and set permissions
RUN mkdir -p /tmp/chrome-user-data /tmp/chrome-data /home/nodejs/.local/share/applications && \
    chown -R nodejs:nodejs /tmp/chrome-user-data /tmp/chrome-data /home/nodejs

# Set HOME environment variable for Chrome
ENV HOME=/home/nodejs

# Change to nodejs user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "--filter", "@linkedin-bot-suite/worker", "start"]