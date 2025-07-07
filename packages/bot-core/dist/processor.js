"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = processJob;
const index_1 = require("./index");
const linkedin_1 = require("@linkedin-bot-suite/linkedin");
const shared_1 = require("@linkedin-bot-suite/shared");
const webhookService_1 = require("./services/webhookService");
const webhookService = new webhookService_1.WebhookService();
/**
 * Safely close browser with timeout
 */
async function safeBrowserClose(browser, timeoutMs = 5000) {
    try {
        await Promise.race([
            browser.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), timeoutMs))
        ]);
        console.log('Browser closed successfully');
    }
    catch (error) {
        console.error('Failed to close browser gracefully:', error);
        // Force kill if still connected
        if (browser.isConnected()) {
            try {
                const process = browser.process();
                if (process) {
                    process.kill('SIGKILL');
                    console.log('Browser process killed');
                }
            }
            catch (killError) {
                console.error('Failed to kill browser process:', killError);
            }
        }
    }
}
async function processJob(job) {
    const jobData = job.data;
    const jobId = job.id;
    let browser = null;
    let page = null;
    let userDataDir = null;
    let heartbeat = null;
    index_1.log.info({ jobId, type: jobData.type }, 'Processing job');
    try {
        // Update job status to processing
        await webhookService.updateJobStatus(jobId, 'processing');
        // Add heartbeat interval to prevent job stalling
        heartbeat = setInterval(() => {
            job.updateProgress(50); // Keep job alive
            console.log(`Heartbeat for job ${jobId}`);
        }, 10000); // Every 10 seconds
        // Initialize browser context with timeout
        console.log('Initializing browser context...');
        const initResult = await Promise.race([
            (0, linkedin_1.initLinkedInContext)(process.env.PROXY_URL ?? ''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser initialization timeout')), 90000))
        ]);
        browser = initResult.browser;
        page = initResult.page;
        userDataDir = initResult.userDataDir;
        // Verify browser and page are healthy
        const browserHealthy = await (0, linkedin_1.checkBrowserHealth)(browser);
        const pageHealth = await (0, linkedin_1.checkPageHealth)(page);
        if (!browserHealthy || !pageHealth.isHealthy) {
            throw new Error(`Browser/page health check failed: ${pageHealth.error || 'Browser unhealthy'}`);
        }
        console.log(`Processing ${jobData.type} job for ${jobData.profileUrl}`);
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
        // Clear heartbeat before completion
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        index_1.log.info({ jobId, type: jobData.type, profileUrl: jobData.profileUrl }, 'Job completed successfully');
        // Process job completion
        await webhookService.processJobCompletion(jobId, true, result);
    }
    catch (err) {
        // Clear heartbeat on error
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        const error = err instanceof Error ? err : new Error('Unknown error');
        const errorCategory = (0, linkedin_1.categorizeError)(error);
        index_1.log.error({
            jobId,
            type: jobData.type,
            profileUrl: jobData.profileUrl,
            errorType: errorCategory.type,
            recoverable: errorCategory.recoverable,
            retryable: errorCategory.retryable,
            error: error.message
        }, `Job failed: ${errorCategory.description}`);
        // Handle different error types
        switch (errorCategory.type) {
            case 'authentication_failed':
                await webhookService.processJobCompletion(jobId, false, null, 'Authentication failed - please update LinkedIn cookies');
                return; // Don't re-throw, no point retrying with bad cookies
            case 'browser_crash':
            case 'frame_detached':
            case 'connection_lost':
                await webhookService.processJobCompletion(jobId, false, null, `Browser error (${errorCategory.type}): ${error.message}`);
                break;
            case 'navigation_failed':
                await webhookService.processJobCompletion(jobId, false, null, `Navigation error: ${error.message}`);
                break;
            default:
                await webhookService.processJobCompletion(jobId, false, null, error.message);
        }
        // Only re-throw if error is retryable (let BullMQ handle retries)
        if (errorCategory.retryable) {
            throw err;
        }
    }
    finally {
        // Clean up resources with proper error handling
        if (page && !page.isClosed()) {
            try {
                await page.close();
                console.log('Page closed successfully');
            }
            catch (error) {
                console.error('Failed to close page:', error);
            }
        }
        if (browser) {
            await safeBrowserClose(browser);
        }
        // Clean up user data directory
        if (userDataDir) {
            try {
                await (0, linkedin_1.cleanupUserDataDir)(userDataDir);
            }
            catch (error) {
                console.error('Failed to cleanup user data directory:', error);
            }
        }
    }
}
