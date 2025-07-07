"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobService_1 = require("../services/jobService");
const auth_1 = require("../middleware/auth");
const rateLimiting_1 = require("../middleware/rateLimiting");
const shared_1 = require("@linkedin-bot-suite/shared");
const router = (0, express_1.Router)();
const jobService = new jobService_1.JobService();
// Get job status
router.get('/:jobId/status', rateLimiting_1.defaultRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_READ), async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await jobService.getJobStatus(jobId);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error getting job status:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get job status',
        });
    }
});
// Get workflow status
router.get('/workflow/:workflowRunId/status', rateLimiting_1.defaultRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_READ), async (req, res) => {
    try {
        const { workflowRunId } = req.params;
        const result = await jobService.getWorkflowStatus(workflowRunId);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error getting workflow status:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get workflow status',
        });
    }
});
// Delete job
router.delete('/:jobId', rateLimiting_1.defaultRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_DELETE), async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await jobService.deleteJob(jobId);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete job',
        });
    }
});
exports.default = router;
