"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = processJob;
const index_1 = require("./index");
const linkedin_1 = require("@linkedin-bot-suite/linkedin");
const shared_1 = require("@linkedin-bot-suite/shared");
const webhookService_1 = require("./services/webhookService");
const webhookService = new webhookService_1.WebhookService();
async function processJob(job) {
    const jobData = job.data;
    const jobId = job.id;
    index_1.log.info({ jobId, type: jobData.type }, 'Processing job');
    // Update job status to processing
    await webhookService.updateJobStatus(jobId, 'processing');
    const { browser, context } = await (0, linkedin_1.initLinkedInContext)(process.env.PROXY_URL ?? '');
    try {
        const page = await context.newPage();
        let result;
        switch (jobData.type) {
            case shared_1.JOB_TYPES.INVITE:
                result = await (0, linkedin_1.sendInvitation)(page, jobData.profileUrl, jobData.note);
                break;
            case shared_1.JOB_TYPES.MESSAGE:
                result = await (0, linkedin_1.sendMessage)(page, jobData.profileUrl, jobData.message);
                break;
            case shared_1.JOB_TYPES.PROFILE_VIEW:
                result = await (0, linkedin_1.viewProfile)(page, jobData.profileUrl);
                break;
            default:
                throw new Error(`Unknown job type: ${jobData.type}`);
        }
        index_1.log.info({ jobId, type: jobData.type, profileUrl: jobData.profileUrl }, 'Job completed successfully');
        // Process job completion
        await webhookService.processJobCompletion(jobId, true, result);
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        index_1.log.error({ jobId, type: jobData.type, profileUrl: jobData.profileUrl, err }, 'Job failed');
        // Process job failure
        await webhookService.processJobCompletion(jobId, false, null, errorMessage);
        throw err; // Re-throw to let BullMQ handle retries
    }
    finally {
        await browser.close();
    }
}
