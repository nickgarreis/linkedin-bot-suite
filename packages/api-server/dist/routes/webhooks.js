"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobService_1 = require("../services/jobService");
const webhookService_1 = require("../services/webhookService");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rateLimiting_1 = require("../middleware/rateLimiting");
const shared_1 = require("@linkedin-bot-suite/shared");
const router = (0, express_1.Router)();
const jobService = new jobService_1.JobService();
const webhookService = new webhookService_1.WebhookService();
// n8n webhook endpoint for single job
router.post('/linkedin/invite', rateLimiting_1.webhookRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_CREATE), validation_1.validateJobPayload, async (req, res) => {
    try {
        const result = await jobService.createJob(req.body, req.user.clientSlug);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create job',
        });
    }
});
// n8n webhook endpoint for message job
router.post('/linkedin/message', rateLimiting_1.webhookRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_CREATE), validation_1.validateJobPayload, async (req, res) => {
    try {
        const result = await jobService.createJob(req.body, req.user.clientSlug);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error creating message job:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create message job',
        });
    }
});
// n8n webhook endpoint for profile view job
router.post('/linkedin/profile-view', rateLimiting_1.webhookRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_CREATE), validation_1.validateJobPayload, async (req, res) => {
    try {
        const result = await jobService.createJob(req.body, req.user.clientSlug);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error creating profile view job:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create profile view job',
        });
    }
});
// n8n webhook endpoint for bulk jobs
router.post('/linkedin/bulk', rateLimiting_1.bulkRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.JOBS_CREATE), validation_1.validateBulkJobPayload, async (req, res) => {
    try {
        const { jobs, workflowId, n8nWebhookUrl } = req.body;
        // Add webhook URL to each job if provided
        const enhancedJobs = jobs.map((job) => ({
            ...job,
            n8nWebhookUrl: n8nWebhookUrl || job.n8nWebhookUrl,
        }));
        const result = await jobService.createBulkJobs(enhancedJobs, req.user.clientSlug, workflowId);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error creating bulk jobs:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create bulk jobs',
        });
    }
});
// Webhook endpoint for job status updates (called by workers)
router.post('/status', rateLimiting_1.webhookRateLimit, auth_1.authenticateApiKey, (0, auth_1.requirePermission)(shared_1.API_PERMISSIONS.WEBHOOKS_RECEIVE), async (req, res) => {
    try {
        const { jobId, success, result, error } = req.body;
        await webhookService.processJobCompletion(jobId, success, result, error);
        res.status(200).json({
            success: true,
            message: 'Status update processed',
        });
    }
    catch (error) {
        console.error('Error processing status update:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process status update',
        });
    }
});
exports.default = router;
