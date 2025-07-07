import { Router } from 'express';
import { JobService } from '../services/jobService';
import { authenticateApiKey, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { defaultRateLimit } from '../middleware/rateLimiting';
import { API_PERMISSIONS } from '@linkedin-bot-suite/shared';

const router = Router();
const jobService = new JobService();

// Get job status
router.get('/:jobId/status',
  defaultRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_READ),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.params;
      const result = await jobService.getJobStatus(jobId);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job status',
      });
    }
  }
);

// Get workflow status
router.get('/workflow/:workflowRunId/status',
  defaultRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_READ),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { workflowRunId } = req.params;
      const result = await jobService.getWorkflowStatus(workflowRunId);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error getting workflow status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workflow status',
      });
    }
  }
);

// Delete job
router.delete('/:jobId',
  defaultRateLimit,
  authenticateApiKey,
  requirePermission(API_PERMISSIONS.JOBS_DELETE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.params;
      const result = await jobService.deleteJob(jobId);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete job',
      });
    }
  }
);

export default router;