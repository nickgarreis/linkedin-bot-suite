import { Router } from 'express';
import { JobService } from '../services/jobService';
import { WebhookService } from '../services/webhookService';
import { authenticateApiKey, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { validateJobPayload, validateBulkJobPayload } from '../middleware/validation';
import { webhookRateLimit, bulkRateLimit } from '../middleware/rateLimiting';
import { API_PERMISSIONS } from '@linkedin-bot-suite/shared';

const router: Router = Router();
const jobService = new JobService();
const webhookService = new WebhookService();

// n8n webhook endpoint for single job
router.post('/linkedin/invite',
  webhookRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_CREATE),
  validateJobPayload,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await jobService.createJob(req.body, req.user!.clientSlug);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error creating job:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create job',
      });
    }
  }
);

// n8n webhook endpoint for message job
router.post('/linkedin/message',
  webhookRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_CREATE),
  validateJobPayload,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await jobService.createJob(req.body, req.user!.clientSlug);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error creating message job:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create message job',
      });
    }
  }
);

// n8n webhook endpoint for profile view job
router.post('/linkedin/profile-view',
  webhookRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_CREATE),
  validateJobPayload,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await jobService.createJob(req.body, req.user!.clientSlug);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error creating profile view job:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create profile view job',
      });
    }
  }
);

// n8n webhook endpoint for bulk jobs
router.post('/linkedin/bulk',
  bulkRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_CREATE),
  validateBulkJobPayload,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { jobs, workflowId, n8nWebhookUrl } = req.body;
      
      // Add webhook URL to each job if provided
      const enhancedJobs = jobs.map((job: any) => ({
        ...job,
        n8nWebhookUrl: n8nWebhookUrl || job.n8nWebhookUrl,
      }));

      const result = await jobService.createBulkJobs(
        enhancedJobs,
        req.user!.clientSlug,
        workflowId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error creating bulk jobs:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create bulk jobs',
      });
    }
  }
);

// Webhook endpoint for job status updates (called by workers)
router.post('/status',
  webhookRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.WEBHOOKS_RECEIVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId, success, result, error } = req.body;
      
      await webhookService.processJobCompletion(jobId, success, result, error);
      
      res.status(200).json({
        success: true,
        message: 'Status update processed',
      });
    } catch (error) {
      console.error('Error processing status update:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process status update',
      });
    }
  }
);

export default router;