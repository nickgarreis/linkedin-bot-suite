FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api-server/package.json ./packages/api-server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/bot-core/package.json ./packages/bot-core/
COPY packages/linkedin/package.json ./packages/linkedin/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build all packages
RUN pnpm run build

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:10000/health || exit 1

# Start the API server
CMD ["pnpm", "--filter", "@linkedin-bot-suite/api-server", "start"]