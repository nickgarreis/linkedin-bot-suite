# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a LinkedIn bot suite built as a monorepo using pnpm workspaces. The project provides HTTP API endpoints for n8n workflow integration and automates LinkedIn actions (invitations, messages, profile views) through a queue-based system using BullMQ and Redis, with Puppeteer for web automation.

## Architecture

### Monorepo Structure
- `packages/shared/` - Shared types, utilities, and validation schemas
- `packages/api-server/` - HTTP API server with webhook endpoints for n8n integration
- `packages/bot-core/` - Core job processing and queue management
- `packages/linkedin/` - LinkedIn automation actions (invite, message, profile view)
- `packages/worker/` - Background worker for processing jobs
- `deployments/` - Render.com deployment configurations
- `docs/` - API documentation and integration guides
- `examples/` - n8n workflow examples and API client samples
- `scripts/` - Database schema and utility scripts

### Key Components

**API Server (packages/api-server/)**
- `routes/webhooks.ts` - n8n webhook endpoints for job creation
- `routes/jobs.ts` - Job status and management endpoints
- `routes/health.ts` - Health check and monitoring endpoints
- `middleware/auth.ts` - API key authentication and authorization
- `services/` - Job creation and webhook notification services

**Shared Package (packages/shared/)**
- `types/common.ts` - Job definitions and common interfaces
- `types/database.ts` - Database schema type definitions
- `utils/validation.ts` - Joi validation schemas for API requests
- `utils/constants.ts` - Application constants and configurations

**LinkedIn Actions (packages/linkedin/)**
- `src/actions/invite.ts` - Connection invitation automation
- `src/actions/message.ts` - Direct messaging automation
- `src/actions/profile.ts` - Profile viewing automation
- `src/auth.ts` - Browser context initialization with stealth plugin

**Core System (packages/bot-core/)**
- `processor.ts` - Multi-action job processor with webhook callbacks
- `services/webhookService.ts` - Webhook notifications and job completion handling

### Technology Stack
- **API Framework**: Express.js with authentication, rate limiting, and CORS
- **Queue System**: BullMQ with Redis for job management
- **Database**: Supabase with RLS policies and enhanced schema
- **Web Automation**: Puppeteer with stealth plugin for LinkedIn interaction
- **Language**: TypeScript with strict mode and composite builds
- **Package Management**: pnpm with workspaces
- **Deployment**: Render.com with Docker containers

## Development Commands

### Build Commands
```bash
# Build all packages using TypeScript composite builds
pnpm run build

# Clean build artifacts
pnpm run build:clean

# Build specific packages (legacy commands)
pnpm run build:shared
pnpm run build:linkedin
pnpm run build:bot-core
pnpm run build:api
pnpm run build:worker
```

### Development Servers
```bash
# Run API server in development mode
pnpm run dev:api

# Run worker in development mode
pnpm run dev:worker

# Run production builds
pnpm run start:api
pnpm run start:worker
```

### Type Checking
```bash
# Type check all packages
pnpm run typecheck

# Type check specific package
pnpm exec tsc --noEmit --project packages/api-server
```

### Package Management
```bash
# Install all dependencies
pnpm install

# Add dependency to specific package
pnpm add <package> --filter @linkedin-bot-suite/<package-name>

# Add dev dependency to root
pnpm add -D <package> -w
```

## Environment Configuration

### Required Environment Variables
- `REDIS_URL` - Redis connection string for BullMQ
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE` - Supabase service role key
- `LINKEDIN_COOKIES_JSON` - LinkedIn session cookies as JSON array string
- `JWT_SECRET` - Secret key for JWT token generation

### API Server Environment Variables
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origins (default: *)
- `API_KEY_HEADER` - API key header name (default: x-api-key)
- `LOG_LEVEL` - Logging level (default: info)

### Worker Environment Variables
- `WORKER_CONCURRENCY` - Number of concurrent jobs (default: 2)
- `PROXY_URL` - HTTP proxy for LinkedIn requests (optional)

### BullMQ Configuration
- `QUEUE_NAME` - BullMQ queue name (default: linkedin-jobs)
- `BULLMQ_PREFIX` - BullMQ key prefix (default: bull)

### Dependency Notes
- `@solana/wallet-standard-features` - Required for Supabase compatibility
- BullMQ `removeOnComplete`/`removeOnFail` use object format: `{ count: N }`

## Database Schema

Use `scripts/enhanced-schema.sql` for complete database setup.

Enhanced schema with workflow tracking:
- `linkedin_accounts` - Account credentials, limits, and activity tracking
- `outreach_logs` - Legacy outreach activity logs
- `api_keys` - API authentication keys with permissions
- `workflow_runs` - n8n workflow execution tracking
- `job_history` - Detailed job execution history and results

## API Integration

### n8n Webhook Endpoints
- `POST /webhook/linkedin/invite` - Send connection invitations
- `POST /webhook/linkedin/message` - Send direct messages
- `POST /webhook/linkedin/profile-view` - View profiles
- `POST /webhook/linkedin/bulk` - Bulk operations

### Job Management Endpoints
- `GET /jobs/{jobId}/status` - Get job status
- `GET /jobs/workflow/{workflowRunId}/status` - Get workflow status
- `DELETE /jobs/{jobId}` - Cancel/delete job

### Authentication
All endpoints require API key authentication:
```
x-api-key: your-api-key-here
```

## Adding New LinkedIn Actions

1. Create new action file in `packages/linkedin/src/actions/`
2. Add action export to `packages/linkedin/src/actions/index.ts`
3. Add job type to `packages/shared/src/types/common.ts`
4. Update job processor in `packages/bot-core/src/processor.ts`
5. Add validation schema in `packages/shared/src/utils/validation.ts`
6. Add webhook endpoint in `packages/api-server/src/routes/webhooks.ts`

## Deployment

### Render.com Deployment
Use configurations in `deployments/render/`:
- `api-server/render.yaml` - API server with Redis
- `worker/render.yaml` - Background worker
- Dockerfiles for containerized deployments

### Required Services
1. **API Server** - Web service for n8n integration
2. **Worker** - Background service for job processing
3. **Redis** - Queue and caching (managed by Render)
4. **Supabase** - Database and authentication (external)

## Build System & TypeScript Configuration

### TypeScript Setup
- **Composite builds**: Each package has its own `tsconfig.json` with proper references
- **Build order**: Dependencies are built automatically via TypeScript project references
- **Type checking**: Run `pnpm run typecheck` to check all packages
- **Workspace resolution**: Internal package imports are properly resolved

### Common Build Issues & Solutions
- **Lockfile out of sync**: Run `rm pnpm-lock.yaml && pnpm install`
- **Build errors**: Ensure dependencies are built first with `pnpm run build`
- **Type errors**: Check that all workspace packages are properly referenced in tsconfig.json

## LinkedIn Automation Notes

- Uses cookie-based authentication (no username/password login)
- Supports German and English LinkedIn interfaces
- Implements stealth measures to avoid detection
- Uses XPath selectors for UI interaction
- Includes proxy support for IP rotation
- Respects rate limits and daily invitation quotas
- Provides detailed error reporting and retry logic
- Uses Promise-based delays instead of deprecated `page.waitForTimeout()`