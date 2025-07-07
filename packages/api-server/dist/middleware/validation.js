"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWebhookPayload = exports.validateBulkJobPayload = exports.validateJobPayload = void 0;
const shared_1 = require("@linkedin-bot-suite/shared");
const validateJobPayload = (req, res, next) => {
    try {
        const validatedData = (0, shared_1.validateJobData)(req.body);
        req.body = validatedData;
        next();
    }
    catch (error) {
        return res.status(400).json({
            error: 'Invalid job data',
            details: error instanceof Error ? error.message : 'Validation failed'
        });
    }
};
exports.validateJobPayload = validateJobPayload;
const validateBulkJobPayload = (req, res, next) => {
    try {
        const validatedData = (0, shared_1.validateBulkJobData)(req.body);
        req.body = validatedData;
        next();
    }
    catch (error) {
        return res.status(400).json({
            error: 'Invalid bulk job data',
            details: error instanceof Error ? error.message : 'Validation failed'
        });
    }
};
exports.validateBulkJobPayload = validateBulkJobPayload;
const validateWebhookPayload = (req, res, next) => {
    const { jobId, status, result } = req.body;
    if (!jobId || !status || !result) {
        return res.status(400).json({
            error: 'Missing required webhook fields: jobId, status, result'
        });
    }
    if (!['completed', 'failed', 'retry'].includes(status)) {
        return res.status(400).json({
            error: 'Invalid status. Must be: completed, failed, or retry'
        });
    }
    next();
};
exports.validateWebhookPayload = validateWebhookPayload;
