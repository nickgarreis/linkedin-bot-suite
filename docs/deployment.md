# Deployment Guide

This guide covers deploying the LinkedIn Bot Suite to Render.com for use with n8n workflows.

## Prerequisites

1. **Render.com Account**: Sign up at [render.com](https://render.com)
2. **Supabase Account**: Sign up at [supabase.com](https://supabase.com) 
3. **LinkedIn Account**: With valid session cookies
4. **Git Repository**: Fork/clone this repository

## Environment Variables

### Required Variables

#### API Server & Worker
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key

# Redis (auto-provided by Render)
REDIS_URL=redis://localhost:6379

# LinkedIn Authentication  
LINKEDIN_COOKIES_JSON='[{"name":"li_at","value":"cookie-value","domain":".linkedin.com"}]'

# Security
JWT_SECRET=your-secret-key-here
```

#### API Server Only
```bash
# Server Configuration
PORT=10000
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=*

# API Configuration
API_KEY_HEADER=x-api-key
LOG_LEVEL=info
```

#### Worker Only  
```bash
# Worker Configuration
WORKER_CONCURRENCY=2
PROXY_URL=http://proxy-server:port  # Optional
```

#### BullMQ Configuration
```bash
QUEUE_NAME=linkedin-jobs
BULLMQ_PREFIX=bull
```

## Supabase Setup

### 1. Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for database to initialize

### 2. Run Database Schema
1. Go to SQL Editor in Supabase dashboard
2. Copy contents of `scripts/enhanced-schema.sql`
3. Execute the SQL to create tables and indexes

### 3. Get Connection Details
1. Go to Settings > API
2. Copy `Project URL` and `Service Role Key`
3. Add these to your environment variables

### 4. Create API Key (Optional)
If you want to test the API, create an API key:

```sql
-- Generate a test API key
INSERT INTO public.api_keys (name, key_hash, client_slug, permissions) 
VALUES (
  'Test API Key',
  encode(digest('your-test-api-key', 'sha256'), 'hex'),
  'test-client', 
  array['jobs:create', 'jobs:read', 'webhooks:receive']
);
```

## LinkedIn Cookie Setup

### 1. Get LinkedIn Cookies
1. Log into LinkedIn in your browser
2. Open Developer Tools (F12)
3. Go to Application/Storage > Cookies > linkedin.com
4. Copy the `li_at` cookie value

### 2. Format Cookie JSON
```json
[
  {
    "name": "li_at", 
    "value": "your-cookie-value-here",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
```

### 3. Add to Environment
Store the JSON as a single line in `LINKEDIN_COOKIES_JSON`.

## Render Deployment

### Method 1: Using Render Dashboard

#### Deploy API Server
1. Go to Render Dashboard
2. Click "New" > "Web Service"
3. Connect your Git repository
4. Configure:
   - **Name**: `linkedin-bot-api`
   - **Environment**: `Node`
   - **Build Command**: `pnpm install && pnpm run build:api`
   - **Start Command**: `pnpm --filter @linkedin-bot-suite/api-server start`
   - **Health Check Path**: `/health`
5. Add environment variables (see list above)
6. Deploy

#### Deploy Worker
1. Click "New" > "Background Worker"
2. Connect your Git repository  
3. Configure:
   - **Name**: `linkedin-bot-worker`
   - **Environment**: `Node`
   - **Build Command**: `pnpm install && pnpm run build:worker`
   - **Start Command**: `pnpm --filter @linkedin-bot-suite/worker start`
4. Add environment variables
5. Deploy

#### Deploy Redis
1. Click "New" > "Redis"
2. Configure:
   - **Name**: `linkedin-bot-redis`
   - **Plan**: `Starter` (free)
3. Deploy
4. Copy connection string to `REDIS_URL` in other services

### Method 2: Using render.yaml

1. Copy the appropriate `render.yaml` from `deployments/render/`
2. Customize environment variables
3. Deploy using Render's GitHub integration

### Method 3: Using Docker

#### Build and Push Images
```bash
# Build single Docker image for both services
docker build -t your-registry/linkedin-bot-suite .
docker push your-registry/linkedin-bot-suite
```

#### Deploy to Render
1. Create services using the custom Docker image
2. For API Server:
   - Use CMD: `["pnpm", "--filter", "@linkedin-bot-suite/api-server", "start"]`
3. For Worker:
   - Use CMD: `["pnpm", "--filter", "@linkedin-bot-suite/worker", "start"]`
4. Configure environment variables for each service

## Post-Deployment Setup

### 1. Verify API Server
```bash
curl https://your-api-server.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "linkedin-bot-api", 
  "version": "1.0.0"
}
```

### 2. Test Worker
Check worker logs in Render dashboard. You should see:
```
Worker is ready and waiting for jobs
```

### 3. Test API Integration
```bash
curl -X POST https://your-api-server.onrender.com/webhook/linkedin/invite \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-test-api-key" \
  -d '{
    "type": "invite",
    "profileUrl": "https://linkedin.com/in/test-profile",
    "note": "Test invitation"
  }'
```

## Monitoring

### 1. Render Metrics
- Monitor CPU/Memory usage in Render dashboard
- Set up alerts for service failures
- Monitor logs for errors

### 2. Application Logs
- API server logs all requests and errors
- Worker logs job processing details
- Use log levels to control verbosity

### 3. Database Monitoring
- Monitor job completion rates in Supabase
- Track failed jobs and error patterns
- Set up alerts for high failure rates

## Scaling

### Horizontal Scaling
- Add more worker instances for higher throughput
- Use different LinkedIn accounts per worker
- Implement load balancing if needed

### Vertical Scaling  
- Upgrade Render plans for more CPU/Memory
- Increase worker concurrency carefully
- Monitor LinkedIn rate limits

## Security

### 1. API Keys
- Generate unique API keys per client
- Set appropriate permissions
- Rotate keys regularly
- Store securely in environment variables

### 2. Network Security
- Use HTTPS for all communications
- Implement CORS properly
- Consider IP whitelisting for webhooks

### 3. LinkedIn Compliance
- Respect LinkedIn's rate limits
- Don't abuse the automation
- Monitor for account restrictions
- Use realistic delays between actions

## Troubleshooting

### Common Issues

#### 1. LinkedIn Authentication Failed
- Check cookie format and values
- Verify cookies haven't expired
- Test login manually in browser

#### 2. Redis Connection Errors
- Verify Redis service is running
- Check connection string format
- Ensure Redis is accessible from workers

#### 3. High Job Failure Rates
- Check LinkedIn account status
- Verify profile URLs are valid
- Monitor for LinkedIn anti-bot measures

#### 4. n8n Integration Issues
- Verify webhook URLs are reachable
- Check API key permissions
- Test endpoints manually first

### Debug Commands

```bash
# Check API health
curl https://your-api.onrender.com/health/detailed

# Check job status
curl -H "x-api-key: key" https://your-api.onrender.com/jobs/JOB-ID/status

# Check worker logs
# (Use Render dashboard or CLI)
```

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review application logs in Render dashboard  
3. Consult the API reference documentation
4. Check GitHub issues in the repository