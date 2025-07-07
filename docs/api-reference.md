# LinkedIn Bot Suite API Reference

## Base URL
```
https://your-api-server.onrender.com
```

## Authentication

All API endpoints require authentication using an API key in the request header:

```
x-api-key: your-api-key-here
```

## Rate Limits

- **Default**: 100 requests per 15 minutes
- **Webhooks**: 60 requests per minute  
- **Bulk operations**: 10 requests per hour

## Endpoints

### Health Check

#### GET /health
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "linkedin-bot-api",
  "version": "1.0.0"
}
```

#### GET /health/detailed
Detailed health check including service dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "linkedin-bot-api",
  "version": "1.0.0",
  "checks": {
    "redis": "healthy",
    "supabase": "healthy",
    "queue": "healthy"
  }
}
```

### LinkedIn Actions

#### POST /webhook/linkedin/invite
Send a LinkedIn connection invitation.

**Request Body:**
```json
{
  "type": "invite",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "note": "Optional personal note (max 300 chars)",
  "accountId": "uuid-optional",
  "workflowId": "optional-workflow-id",
  "n8nWebhookUrl": "https://your-webhook-url",
  "priority": 5,
  "delay": 0
}
```

**Response:**
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

#### POST /webhook/linkedin/message
Send a LinkedIn message.

**Request Body:**
```json
{
  "type": "message",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "message": "Your message content (max 8000 chars)",
  "accountId": "uuid-optional",
  "workflowId": "optional-workflow-id", 
  "n8nWebhookUrl": "https://your-webhook-url",
  "priority": 5,
  "delay": 0
}
```

**Response:** Same as invite endpoint.

#### POST /webhook/linkedin/profile-view
View a LinkedIn profile.

**Request Body:**
```json
{
  "type": "profile_view",
  "profileUrl": "https://linkedin.com/in/profile-name",
  "accountId": "uuid-optional",
  "workflowId": "optional-workflow-id",
  "n8nWebhookUrl": "https://your-webhook-url", 
  "priority": 5,
  "delay": 0
}
```

**Response:** Same as invite endpoint.

#### POST /webhook/linkedin/bulk
Execute multiple LinkedIn actions in bulk.

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
  "n8nWebhookUrl": "https://your-webhook-url"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "workflowRunId": "uuid-here",
    "totalJobs": 2,
    "createdJobs": 2,
    "failedJobs": 0,
    "jobs": [
      {
        "jobId": "uuid-1",
        "queueId": "queue-1",
        "status": "queued",
        "type": "invite"
      },
      {
        "jobId": "uuid-2", 
        "queueId": "queue-2",
        "status": "queued",
        "type": "message"
      }
    ]
  }
}
```

### Job Management

#### GET /jobs/{jobId}/status
Get the status of a specific job.

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "queueStatus": "completed",
    "progress": 100,
    "attempts": 1,
    "dbStatus": "completed",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "startedAt": "2024-01-01T00:01:00.000Z", 
    "completedAt": "2024-01-01T00:02:00.000Z",
    "error": null,
    "result": {
      "success": true,
      "message": "Invitation sent successfully"
    }
  }
}
```

#### GET /jobs/workflow/{workflowRunId}/status
Get the status of a workflow run.

**Response:**
```json
{
  "success": true,
  "data": {
    "workflowRunId": "uuid-here",
    "status": "completed",
    "totalJobs": 5,
    "completedJobs": 4,
    "failedJobs": 1,
    "startedAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:05:00.000Z",
    "jobs": [
      {
        "id": "job-1",
        "status": "completed",
        "job_type": "invite"
      }
    ]
  }
}
```

#### DELETE /jobs/{jobId}
Cancel and delete a job.

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

### Status Updates

#### POST /webhook/status
Receive job completion status updates (used internally by workers).

**Request Body:**
```json
{
  "jobId": "uuid-here",
  "success": true,
  "result": {
    "success": true,
    "message": "Action completed successfully"
  },
  "error": null
}
```

## Webhooks

When you provide an `n8nWebhookUrl` in your requests, the system will send webhook notifications when jobs complete.

### Webhook Payload

**Successful Job:**
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

**Failed Job:**
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

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details if available"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created (for job creation)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Data Types

### Job Priority
Integer from 1-10, where 1 is highest priority and 10 is lowest.

### Job Delay  
Integer in milliseconds to delay job execution.

### Job Status
- `pending` - Job created but not started
- `processing` - Job currently being executed
- `completed` - Job finished successfully
- `failed` - Job failed after all retry attempts
- `retry` - Job failed but will be retried

### Workflow Status
- `pending` - Workflow created but no jobs started
- `running` - Some jobs are still processing
- `completed` - All jobs finished successfully  
- `failed` - One or more jobs failed permanently