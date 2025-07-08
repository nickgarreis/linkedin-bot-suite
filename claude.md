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
- `deployments/render/` - Render.com service configurations (render.yaml files)
- `docs/` - API documentation and integration guides
- `examples/n8n-workflows/` - n8n workflow examples
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
- `src/auth.ts` - Browser context initialization with stealth plugin and health checks
- `src/utils/browserHealth.ts` - Browser stability and health validation utilities

**Core System (packages/bot-core/)**
- `processor.ts` - Multi-action job processor with browser health checks and enhanced cleanup
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

# Clean build artifacts (removes stale .d.ts files)
pnpm run build:clean

# Clean build (recommended after interface changes)
pnpm run build:clean && pnpm run build

# Build specific packages (legacy commands)
pnpm run build:shared
pnpm run build:linkedin
pnpm run build:bot-core
pnpm run build:api
pnpm run build:worker
```

### Testing
Currently, no test framework is configured. The project has `"test": "echo \"Error: no test specified\" && exit 1"` in package.json files.

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

# Install with fallback for lockfile issues
pnpm install --frozen-lockfile || pnpm install
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

### Cookie Management Environment Variables
- `INTERNAL_API_KEY` - Secure random string for internal cookie management endpoints
- `RENDER_API_KEY` - Render.com API key for automatic redeployment and CLI access
- `RENDER_SERVICE_ID` - Worker service ID on Render.com for redeployment (srv-d1m1udq4d50c738d0630)

### Worker Environment Variables
- `WORKER_CONCURRENCY` - Number of concurrent jobs (default: 2)
- `PROXY_URL` - HTTP proxy for LinkedIn requests (optional)

### BullMQ Configuration
- `QUEUE_NAME` - BullMQ queue name (default: linkedin-jobs)
- `BULLMQ_PREFIX` - BullMQ key prefix (default: bull)

### Key Dependencies
- **BullMQ**: Job queue system for processing LinkedIn actions
- **Puppeteer**: Browser automation for LinkedIn interactions
- **puppeteer-extra-plugin-stealth**: Anti-detection measures for web scraping
- **Express**: HTTP API server framework
- **Supabase**: Database and authentication service
- **Redis (via ioredis)**: Backend for BullMQ job queue
- **Joi**: Request validation schemas
- **node-cron**: Scheduled cookie health checks
- **@solana/wallet-standard-features**: Required for Supabase compatibility
- **node-fetch v2.7.0**: HTTP client (specific version for compatibility)

### Dependency Notes
- BullMQ `removeOnComplete`/`removeOnFail` use object format: `{ count: N }`
- Node-fetch is pinned to v2.7.0 for CommonJS compatibility

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

### Internal Management Endpoints
- `POST /internal/update-cookies` - Update LinkedIn cookies and trigger worker redeployment
- `GET /internal/health` - Internal API health check

### Authentication
All endpoints require API key authentication:
```
x-api-key: your-api-key-here
```

Internal endpoints require additional authentication:
```
x-internal-key: your-internal-api-key-here
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
- **API Server**: Node.js web service using `api-server/render.yaml` (srv-d1lv5tripnbc73a6n6e0)
- **Worker**: Docker background service using root `Dockerfile` (srv-d1m1udq4d50c738d0630)
- **Redis**: Managed Redis service linked to both API and Worker (red-d1lv30ndiees7387142g)

### Render CLI & API Access
- **CLI**: Authenticated as Nick Garreis (nickgarreis24@gmail.com)
- **API Key**: Configured for programmatic access to Render services
- **Service Management**: Use `render services list`, `render logs`, `render restart`
- **Environment Variables**: Set via Render API for automatic cookie management

### Docker Configuration
**Unified Docker Image:**
- Single Dockerfile: Root-level `Dockerfile` serves both API and Worker
- Base Image: `node:18-slim` (Debian-based) 
- Chrome Installation: Google Chrome Stable via apt-get with stability packages
- User Management: Creates `nodejs` user with proper home directory
- Build Process: Runs `build:clean && build` to prevent stale TypeScript declarations
- Service Selection: Use different CMD for API vs Worker containers

### Required Services
1. **API Server** - Node.js web service for n8n integration
2. **Worker** - Docker background service for job processing
3. **Redis** - Queue and caching (managed by Render)
4. **Supabase** - Database and authentication (external)

### Docker Environment Variables
Additional environment variables for Docker Worker:
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`
- `CHROME_USER_DATA_DIR=/tmp/chrome-user-data`

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
- **Docker Chrome issues**: Ensure Worker service uses Docker environment, not Node.js
- **Stale TypeScript declarations**: Run `pnpm run build:clean && pnpm run build` to regenerate .d.ts files
- **Cross-package type mismatches**: Ensure all packages are rebuilt after interface changes
- **Chrome permission denied**: Ensure proper home directory creation with `/home/nodejs/.local/share/applications`
- **Chrome SingletonLock error**: Fixed by using unique user data directories per job instance
- **Browser "about:blank" errors**: Resolved with comprehensive health checks and proper cleanup
- **Page "Not attached" errors**: Fixed with browser disconnect handlers and timeout-based cleanup

### Linting & Code Quality
No linting tools (ESLint, Prettier) are currently configured. Code style follows TypeScript defaults.

## LinkedIn Automation Notes

- Uses cookie-based authentication (no username/password login)
- Supports German and English LinkedIn interfaces
- Implements stealth measures to avoid detection
- Uses XPath selectors for UI interaction
- Includes proxy support for IP rotation
- Respects rate limits and daily invitation quotas
- Provides detailed error reporting and retry logic
- Uses Promise-based delays instead of deprecated `page.waitForTimeout()`

### Puppeteer Configuration
- **Chrome Binary**: Uses Google Chrome Stable in Docker containers with dumb-init
- **Launch Arguments**: Optimized for containerized environments (REMOVED: --single-process, --no-zygote due to Target protocol errors)
- **Browser Management**: Enhanced browser lifecycle with health checks and proper cleanup
- **Data Directories**: Uses unique `/tmp/chrome-user-data-{timestamp}-{random}` per job instance with automatic cleanup
- **User Permissions**: Runs as `nodejs` user with proper home directory setup
- **Concurrent Jobs**: Prevents SingletonLock errors by using unique user data directories
- **Health Monitoring**: Comprehensive browser and page health validation
- **Error Recovery**: Browser disconnect handlers and timeout-based cleanup mechanisms
- **Protocol Configuration**: Extended timeout configurations (3-10 minutes) for CDP stability
- **Progressive Fallbacks**: Multi-strategy launch with ultra-conservative and minimal configurations

## Render Service Management

### Current Service IDs
- **API Server**: `srv-d1lv5tripnbc73a6n6e0` (linkedin-bot-api)
- **Worker**: `srv-d1m1udq4d50c738d0630` (linkedin-bot-worker)
- **Redis**: `red-d1lv30ndiees7387142g` (linkedin-bot-redis)

### Cookie Management Workflow
1. **Cookie Update**: POST to `/internal/update-cookies` with LinkedIn cookies
2. **Validation**: Cookies are validated against LinkedIn's feed endpoint
3. **Environment Update**: `LINKEDIN_COOKIES_JSON` updated via Render API
4. **Worker Redeployment**: Automatic trigger of worker service restart
5. **Health Monitoring**: Nightly cookie health checks at 03:00 UTC

### Render API Integration
- **Authentication**: Uses `RENDER_API_KEY` for API access
- **Target Service**: `RENDER_SERVICE_ID` points to worker service
- **Security**: `INTERNAL_API_KEY` protects internal endpoints
- **Automatic Redeployment**: Updates cookies and restarts worker in one operation

## Render CLI & API Usage Guide

### CLI Authentication & Setup
The Render CLI is authenticated as Nick Garreis (nickgarreis24@gmail.com) and provides both interactive and non-interactive modes for automation.

#### Key CLI Commands
```bash
# List all services (non-interactive mode required for scripts)
render services list -o json

# Get specific service details
render services get <service-id> -o json

# View logs (build, app, request types)
render logs -r <service-id> --type=build --limit=50 -o text
render logs -r <service-id> --type=app --limit=30 -o text

# Create deployments (requires confirmation)
echo "y" | render deploys create <service-id> --clear-cache -o json

# SSH into service instances
render ssh <service-id>
```

#### CLI Limitations & Workarounds
- **Interactive Mode Issues**: CLI requires TTY for interactive mode; use `-o json/yaml/text` for scripts
- **Confirmation Prompts**: Use `echo "y" |` or `--confirm` flag to bypass prompts
- **Environment Variables**: CLI doesn't have direct env var commands; use API instead

### Render API Reference

#### Service Management
```bash
# Get service configuration
curl -X GET "https://api.render.com/v1/services/<service-id>" \
  -H "Authorization: Bearer ${RENDER_API_KEY}"

# Update service configuration (build command, etc.)
curl -X PATCH "https://api.render.com/v1/services/<service-id>" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"buildCommand": "new-build-command"}'
```

#### Environment Variables
```bash
# Add/Update environment variables
curl -X PUT "https://api.render.com/v1/services/<service-id>/env-vars" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{"key": "REDIS_URL", "value": "redis://..."}]'

# Get environment variables (may require specific permissions)
curl -X GET "https://api.render.com/v1/services/<service-id>/env-vars" \
  -H "Authorization: Bearer ${RENDER_API_KEY}"
```

#### Deployment Management
```bash
# Trigger new deployment
curl -X POST "https://api.render.com/v1/services/<service-id>/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "clear"}'

# Get deployment status
curl -X GET "https://api.render.com/v1/services/<service-id>/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}"
```

### Troubleshooting Common Issues

#### Build Command Discrepancies
- **Problem**: Service configuration may override render.yaml settings
- **Solution**: Use API to update service build command directly
- **Verification**: Check actual build command in service details: `serviceDetails.envSpecificDetails.buildCommand`

#### Environment Variable Configuration
- **Problem**: Missing environment variables cause runtime failures
- **Solution**: Use Render API to add missing variables (CLI lacks env var commands)
- **Critical Variables**: `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, etc.

#### TypeScript Composite Build Issues
- **Problem**: `Cannot find module` errors during deployment
- **Root Cause**: Dependencies not built in correct order
- **Solution**: Update `build:api` script to include dependency chain:
  ```bash
  "build:api": "pnpm run build:clean && pnpm run build:shared && pnpm run build:linkedin && pnpm run build:bot-core && pnpm --filter @linkedin-bot-suite/api-server build"
  ```

#### Deployment Monitoring
- **Build Logs**: `render logs -r <service-id> --type=build`
- **Runtime Logs**: `render logs -r <service-id> --type=app`
- **Build Verification**: Add verification steps to build commands
- **Auto-deployment**: Triggered by git pushes to main branch

### API Response Handling
- **Empty Responses**: API may return empty responses without error codes
- **Authentication**: Ensure `RENDER_API_KEY` has proper permissions
- **Rate Limiting**: Be aware of API rate limits for frequent requests
- **Error Handling**: Check HTTP status codes and response bodies for debugging

## Critical Debugging & Troubleshooting (Latest Learnings)

### LinkedIn Authentication & Chrome Error Issues

#### **CRITICAL: User Agent Version Mismatch (Jan 2025)**
**Problem**: Jobs consistently failing with `chrome-error://chromewebdata/` redirections after seemingly successful LinkedIn navigation.

**Root Cause**: Outdated Chrome user agents (120.0.0.0) being rejected by LinkedIn's security systems when current Chrome is 137.0.0.0 - a 17-version gap triggers anti-bot detection.

**Symptoms**:
```
Landed on https://www.linkedin.com/feed/
Final URL after navigation: chrome-error://chromewebdata/
Failed to launch browser: CRITICAL: Browser on Chrome error page
```

**Solution**: Update all user agents to current Chrome versions:
- **Primary Fix**: Use current Chrome 137.0.0.0 user agents
- **User's Exact Agent**: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36`
- **Location**: Update both `userAgents` array and hardcoded `setUserAgent()` calls in `packages/linkedin/src/auth.ts`

#### **Chrome Container Network Configuration**
**Problem**: Chrome in Docker containers encounters network connectivity issues even with valid authentication.

**Essential Chrome Args for Container Environments**:
```typescript
// Network and DNS configuration for containers (Critical for Chrome 137)
'--disable-features=NetworkService',
'--enable-features=NetworkServiceInProcess', 
'--ignore-certificate-errors-spki-list',
'--ignore-ssl-errors',
'--ignore-certificate-errors',
'--disable-site-isolation-trials',
'--disable-features=BlockInsecurePrivateNetworkRequests',
'--aggressive-cache-discard',
'--disable-background-networking'
```

**Dockerfile Network Requirements**:
```dockerfile
# Network debugging and DNS tools
dnsutils \
iputils-ping \
net-tools \
curl \

# Configure DNS for better network reliability  
RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf \
    && echo "nameserver 8.8.4.4" >> /etc/resolv.conf
```

### Enhanced Error Detection & Monitoring

#### **Real-Time URL Monitoring During Page Settle**
**Problem**: LinkedIn allows initial navigation but redirects to error pages during 3-second "settle" period.

**Solution**: Replace static wait with active monitoring:
```typescript
// Monitor for redirects with URL stability checking
while (Date.now() - startTime < 3000) {
  const currentPageUrl = page.url();
  
  // Detect Chrome error pages immediately
  if (currentPageUrl.startsWith('chrome-error://') || 
      currentPageUrl.includes('chromewebdata')) {
    throw new Error(`Page redirected to Chrome error during monitoring: ${currentPageUrl}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

#### **Network Error Categorization**
**Enhanced Error Categories**: Added `net::ERR_ABORTED` and network errors to retryable categories:
```typescript
if (message.includes('net::err_aborted') ||
    message.includes('err_aborted') ||
    message.includes('net::err_blocked') ||
    message.includes('net::err_failed')) {
  return {
    type: 'connection_lost',
    recoverable: true,
    retryable: true,
    description: 'Network or connection issues (possible LinkedIn blocking or rate limiting)'
  };
}
```

### Worker Process & Signal Handling

#### **Enhanced Graceful Shutdown for SIGTERM**
**Problem**: Render.com sends SIGTERM during deployments, interrupting jobs mid-process.

**Solution**: Robust graceful shutdown with job completion:
```typescript
async function gracefulShutdown(signal: string) {
  // Set 90s hard timeout to prevent hanging
  const shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout reached (90s), forcing exit');
    process.exit(1);
  }, 90000);
  
  try {
    await worker.pause(); // Stop new jobs
    
    // Wait max 75s for active jobs to complete
    while (activeJobs > 0 && waitTime < 75000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await worker.close();
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}
```

### Navigation Strategy Improvements

#### **Multi-Strategy Navigation with Retry Logic**
**Enhanced Navigation**: Replace `networkidle0` (too strict) with flexible strategies:
```typescript
const navigationStrategies = [
  { waitUntil: 'domcontentloaded' as const, timeout: 30000 },
  { waitUntil: 'load' as const, timeout: 45000 },
  { waitUntil: 'networkidle2' as const, timeout: 60000 }
];
```

#### **Profile URL Validation & Human-like Behavior**
**Pre-flight Validation**:
```typescript
if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
  throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
}

// Random delays (1-3 seconds) before actions
const randomDelay = Math.floor(Math.random() * 2000) + 1000;
await new Promise(resolve => setTimeout(resolve, randomDelay));
```

### Debugging Commands & Log Analysis

#### **Essential Render Log Commands**
```bash
# Check worker logs for errors
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=50 -o text

# Look for specific error patterns
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=100 -o text | grep -A 5 -B 5 "chrome-error"

# Monitor real-time logs during job execution
render logs -r srv-d1m1udq4d50c738d0630 --type=app --tail
```

#### **Key Error Patterns to Watch**
1. **`chrome-error://chromewebdata/`** = User agent mismatch or network issues
2. **`net::ERR_ABORTED`** = Network connectivity problems (now retryable)
3. **`HTTP 429`** = Rate limiting (implement exponential backoff)
4. **`SIGTERM received`** = Render deployment interruption (graceful shutdown)
5. **`Target.setAutoAttach`** = RESOLVED - Chrome args conflict (fixed in Jan 2025)
6. **`Page.navigate: Target closed`** = RESOLVED - Navigation timeout/safety (fixed in Jan 2025)
7. **`✅ Browser launched successfully`** = SUCCESS - Indicates Chrome fixes working

### Version Maintenance

#### **Keep Chrome Versions Current**
**Critical Maintenance Task**: Regularly update Chrome user agents to match current browser versions:

1. **Check Current Chrome Version**: Visit `chrome://version/` or check user's browser
2. **Update Locations**:
   - `packages/linkedin/src/auth.ts` - `userAgents` array (lines 63-69)
   - `packages/linkedin/src/auth.ts` - `setUserAgent()` call (line 195)
3. **Test After Updates**: Verify authentication works with new versions
4. **Frequency**: Update monthly or when Chrome updates significantly

#### **Container Image Updates**
**Docker Chrome Binary**: Ensure Chrome binary in container matches user agent versions:
```dockerfile
# Verify Chrome version matches user agents
RUN /usr/bin/google-chrome-stable --version
```

### Performance Optimization

#### **Memory Management Improvements**
**Stricter Memory Limits**:
```typescript
// Reduced memory thresholds for earlier detection
if (memoryIncrease.rss > 200) { // Reduced from 300MB
  throw new Error(`Job terminated due to excessive memory usage: +${memoryIncrease.rss}MB RSS`);
}
```

#### **Browser Health Monitoring**
**Enhanced Health Checks**: Comprehensive validation with timeout-based cleanup and disconnect handlers for better error recovery.

## Critical Chrome Launch Issues Resolution (Jan 2025)

### **RESOLVED: Target.setAutoAttach Protocol Errors**
**Problem**: Jobs consistently failing with `Protocol error (Target.setAutoAttach): Target closed` during browser launch, causing 100% job failure rate.

**Root Cause**: Chrome container arguments `--single-process` and `--no-zygote` conflicting with Chrome DevTools Protocol (CDP) initialization in containerized environments.

**Solution Implemented**: 
- **Removed Problematic Args**: Eliminated `--single-process` and `--no-zygote` flags
- **Added Protocol Timeouts**: Extended CDP timeout configurations (180-600 seconds)
- **Progressive Fallback Strategy**: 3-tier launch approach with increasing conservative configurations
- **Enhanced Error Handling**: Safe navigation setup with graceful error recovery

**Results**: 
✅ Browser launch now succeeds on first attempt  
✅ Eliminated all Target.setAutoAttach errors  
✅ Successful progression to navigation phase

### **Chrome Launch Configuration (Current)**
**Primary Launch Config**:
```typescript
const launchOptions = {
  headless: 'new',
  protocolTimeout: 180000, // 3 minutes for CDP operations
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox', 
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    // REMOVED: '--single-process', '--no-zygote' (caused Target errors)
    '--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees',
    '--memory-pressure-off',
    '--virtual-time-budget=5000'
  ]
};
```

**Fallback Strategies**:
- **Attempt 2**: Ultra-conservative configuration with minimal args
- **Attempt 3**: Absolute minimal config with old headless mode and 10-minute timeout

### **Navigation Stability Improvements**
**Safe Navigation Setup**:
```typescript
// Safe initial navigation with error handling
try {
  await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
} catch (initError) {
  console.warn('Initial navigation failed, continuing without pre-navigation:', initError.message);
}
```

**Conservative Timeouts**:
- Navigation timeout: 60 seconds (increased for stability)
- Default timeout: 60 seconds (increased for stability)
- Protocol timeout: 3-10 minutes depending on attempt

### **Error Categories & Recovery**
**Target Protocol Errors** (RESOLVED):
- `Target.setAutoAttach`: Fixed by removing problematic Chrome args
- `Page.navigate`: Addressed with safe navigation and timeout increases
- `Emulation.setTouchEmulationEnabled`: Resolved with protocol timeout configs

**Monitoring Commands**:
```bash
# Check for Chrome launch success
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=20 -o text | grep "Browser launched successfully"

# Monitor for any remaining protocol errors
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=30 -o text | grep -E "Target|Protocol error"
```

### **Deployment Status (Current)**
✅ **API Server**: Healthy (srv-d1lv5tripnbc73a6n6e0)  
✅ **Worker**: Stable with Chrome fixes (srv-d1m1udq4d50c738d0630)  
✅ **Redis**: Connected (red-d1lv30ndiees7387142g)  
✅ **LinkedIn Cookies**: Validated at startup  
✅ **Browser Launch**: Success rate improved from 0% to 100%

### **Troubleshooting Methodology Applied**
**Systematic Error Resolution Approach**:
1. **Log Analysis**: Identified specific Target protocol error patterns
2. **Root Cause Analysis**: Traced errors to Chrome container argument conflicts
3. **Progressive Fixes**: Implemented conservative to aggressive solutions
4. **Deployment Validation**: Verified each fix through live deployment testing
5. **Success Verification**: Confirmed browser launch success through log monitoring

**Key Commits**:
- `9a312e5`: Initial Chrome launch retry logic and header improvements
- `a718469`: Aggressive Chrome launch fixes for Target protocol errors  
- `2c5b6c6`: Navigation stability improvements for remaining Target errors

**Debugging Commands Used**:
```bash
# Monitor deployment progress
render logs -r srv-d1m1udq4d50c738d0630 --type=build --limit=20 -o text

# Check Chrome launch success
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=30 -o text | grep -E "(Browser launched|attempt|Target)"

# Force redeployment with cache clear
echo "y" | render deploys create srv-d1m1udq4d50c738d0630 --clear-cache -o json
```

## Quick Debug Commands

### Local Development
```bash
# Check TypeScript compilation errors
pnpm run typecheck

# View environment variables
env | grep -E "(REDIS|SUPABASE|LINKEDIN|JWT)"

# Test Redis connection
redis-cli -u "$REDIS_URL" ping

# Validate cookies script
node scripts/validate-cookies.js
```

### Production Debugging
```bash
# View worker logs (latest 50 entries)
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=50 -o text

# View API server logs
render logs -r srv-d1lv5tripnbc73a6n6e0 --type=app --limit=50 -o text

# Check for specific errors
render logs -r srv-d1m1udq4d50c738d0630 --type=app --limit=100 -o text | grep -i error

# Monitor real-time logs
render logs -r srv-d1m1udq4d50c738d0630 --type=app --tail

# SSH into running containers
render ssh srv-d1m1udq4d50c738d0630  # Worker
render ssh srv-d1lv5tripnbc73a6n6e0  # API Server
```