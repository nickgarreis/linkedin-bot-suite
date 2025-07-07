# n8n Integration Guide

This guide explains how to integrate the LinkedIn Bot Suite with n8n workflows.

## Overview

The LinkedIn Bot Suite provides HTTP endpoints that can be called from n8n workflows to automate LinkedIn actions like sending invitations, messages, and viewing profiles.

## API Endpoints

### Base URL
```
https://your-api-server.onrender.com
```

### Authentication
All endpoints require an API key in the header:
```
x-api-key: your-api-key-here
```

### Available Endpoints

#### 1. Send LinkedIn Invitation
```
POST /webhook/linkedin/invite
```

**Request Body:**
```json
{
  "type": "invite",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "note": "Optional personal note",
  "workflowId": "optional-workflow-id",
  "n8nWebhookUrl": "https://your-n8n-webhook-url",
  "priority": 5,
  "delay": 0
}
```

#### 2. Send LinkedIn Message
```
POST /webhook/linkedin/message
```

**Request Body:**
```json
{
  "type": "message",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "message": "Your message content here",
  "workflowId": "optional-workflow-id",
  "n8nWebhookUrl": "https://your-n8n-webhook-url",
  "priority": 5,
  "delay": 0
}
```

#### 3. View LinkedIn Profile
```
POST /webhook/linkedin/profile-view
```

**Request Body:**
```json
{
  "type": "profile_view",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "workflowId": "optional-workflow-id",
  "n8nWebhookUrl": "https://your-n8n-webhook-url",
  "priority": 5,
  "delay": 0
}
```

#### 4. Bulk Operations
```
POST /webhook/linkedin/bulk
```

**Request Body:**
```json
{
  "jobs": [
    {
      "type": "invite",
      "profileUrl": "https://linkedin.com/in/profile1",
      "note": "Personal note"
    },
    {
      "type": "message",
      "profileUrl": "https://linkedin.com/in/profile2",
      "message": "Your message"
    }
  ],
  "workflowId": "bulk-operation-123",
  "n8nWebhookUrl": "https://your-n8n-webhook-url"
}
```

## n8n Workflow Setup

### 1. HTTP Request Node Configuration

1. **Method**: POST
2. **URL**: `https://your-api-server.onrender.com/webhook/linkedin/invite`
3. **Headers**:
   - `Content-Type`: application/json
   - `x-api-key`: your-api-key
4. **Body**: JSON with the required parameters

### 2. Webhook Response Handling

The API will immediately return a response with job details:

```json
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "queueId": "queue-job-id",
    "status": "queued",
    "type": "invite",
    "profileUrl": "https://linkedin.com/in/profile-name"
  }
}
```

### 3. Completion Webhooks

If you provide an `n8nWebhookUrl`, the system will send a completion webhook when the job finishes:

```json
{
  "jobId": "uuid-here",
  "workflowId": "your-workflow-id",
  "status": "completed",
  "result": {
    "success": true,
    "jobId": "uuid-here",
    "profileUrl": "https://linkedin.com/in/profile-name",
    "action": "invite",
    "message": "Job completed successfully",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Error Handling

### API Error Responses
```json
{
  "success": false,
  "error": "Error message here",
  "details": "Additional error details"
}
```

### Common Error Codes
- `400`: Bad request (validation error)
- `401`: Unauthorized (invalid API key)
- `403`: Forbidden (insufficient permissions)
- `429`: Too many requests (rate limited)
- `500`: Internal server error

### Webhook Error Handling
Failed jobs will send error webhooks:

```json
{
  "jobId": "uuid-here",
  "workflowId": "your-workflow-id",
  "status": "failed",
  "result": {
    "success": false,
    "jobId": "uuid-here",
    "profileUrl": "https://linkedin.com/in/profile-name",
    "action": "invite",
    "error": "Connect button not found - user may already be connected",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Best Practices

### 1. Rate Limiting
- The API has built-in rate limiting
- Space out your requests to avoid hitting limits
- Use the `delay` parameter to schedule jobs

### 2. Error Recovery
- Implement error handling in your n8n workflows
- Use the webhook responses to track job completion
- Set up retry logic for failed jobs

### 3. Workflow Management
- Use meaningful `workflowId` values to track related jobs
- Implement proper logging and monitoring
- Consider batch operations for efficiency

### 4. LinkedIn Account Management
- Monitor daily limits for your LinkedIn accounts
- Rotate between multiple accounts if needed
- Respect LinkedIn's terms of service

## Example n8n Workflows

See the `examples/n8n-workflows/` directory for complete workflow files that you can import into n8n.

## Monitoring and Debugging

### Job Status Endpoints
```
GET /jobs/{jobId}/status
GET /jobs/workflow/{workflowRunId}/status
```

### Health Check
```
GET /health
GET /health/detailed
```

Use these endpoints to monitor the health of your API server and track job progress.