"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = processJob;
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
    let jobTimeout = null;
    // Memory monitoring
    const startMemory = process.memoryUsage();
    const startTime = Date.now();
    console.log(`[bot-core] Processing job started: ${jobId}, type: ${jobData.type}, memory: ${Math.round(startMemory.rss / 1024 / 1024)}MB RSS`);
    try {
        // Update job status to processing
        await webhookService.updateJobStatus(jobId, 'processing');
        // Set job timeout (5 minutes max per job) - increased from 2 minutes for better button detection
        const jobTimeoutMs = 5 * 60 * 1000; // 5 minutes
        jobTimeout = setTimeout(() => {
            const error = new Error(`Job ${jobId} timed out after ${jobTimeoutMs / 1000} seconds`);
            console.error(`[bot-core] Job timeout: ${jobId}, timeout: ${jobTimeoutMs}ms`);
            throw error;
        }, jobTimeoutMs);
        // Add heartbeat interval to prevent job stalling with enhanced memory monitoring
        heartbeat = setInterval(async () => {
            const currentMemory = process.memoryUsage();
            const memoryIncrease = {
                rss: Math.round((currentMemory.rss - startMemory.rss) / 1024 / 1024),
                heapUsed: Math.round((currentMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024)
            };
            job.updateProgress(50); // Keep job alive
            console.log(`Heartbeat for job ${jobId} - Memory delta: RSS +${memoryIncrease.rss}MB, Heap +${memoryIncrease.heapUsed}MB`);
            // Force GC if memory is high
            if (memoryIncrease.rss > 400 && global.gc) {
                console.log('Force garbage collection');
                global.gc();
            }
            // Close extra pages to prevent memory leaks
            if (browser?.isConnected()) {
                const pages = await browser.pages();
                if (pages.length > 1) {
                    for (let i = 1; i < pages.length; i++) {
                        try {
                            await pages[i].close();
                        }
                        catch { }
                    }
                }
            }
            // Stricter memory leak detection and prevention
            if (memoryIncrease.rss > 600) { // Increased from 150MB for 2GB container
                console.error(`⚠️ CRITICAL: Job ${jobId} using excessive memory: +${memoryIncrease.rss}MB RSS - force terminating job`);
                throw new Error(`Job terminated due to excessive memory usage: +${memoryIncrease.rss}MB RSS`);
            }
        }, 5000); // Every 5 seconds instead of 10
        // Initialize browser context with timeout
        console.log('Initializing browser context...');
        const initResult = await Promise.race([
            (0, linkedin_1.initLinkedInContext)(process.env.PROXY_URL ?? ''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser initialization timeout')), 45000) // Reduced from 60s to 45s
            )
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
                // Use hybrid invitation system (GraphQL + DOM fallback)
                const enableAdvancedDiagnostics = process.env.LINKEDIN_ADVANCED_DIAGNOSTICS === 'true';
                if (enableAdvancedDiagnostics) {
                    console.log('🔬 Using advanced diagnostics mode for invitation');
                    result = await (0, linkedin_1.sendInvitationWithAdvancedDiagnostics)(page, jobData.profileUrl, jobData.note);
                }
                else {
                    console.log('🚀 Using hybrid invitation system (GraphQL + DOM fallback)');
                    result = await (0, linkedin_1.sendHybridInvitation)(page, jobData.profileUrl, jobData.note);
                }
                break;
            case shared_1.JOB_TYPES.MESSAGE:
                result = await (0, linkedin_1.sendMessage)(page, jobData.profileUrl, jobData.message);
                break;
            case shared_1.JOB_TYPES.PROFILE_VIEW:
                result = await (0, linkedin_1.viewProfile)(page, jobData.profileUrl);
                break;
            case shared_1.JOB_TYPES.API_RESEARCH:
                console.log('🔬 Starting LinkedIn API research mode');
                const researchActions = jobData.actions || ['invite', 'message'];
                result = await (0, linkedin_1.researchLinkedInAPIs)(page, jobData.profileUrl);
                console.log('📊 API research completed');
                break;
            default:
                throw new Error(`Unknown job type: ${jobData.type}`);
        }
        // Clear timers before completion
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        if (jobTimeout) {
            clearTimeout(jobTimeout);
            jobTimeout = null;
        }
        // Final memory and performance report
        const endMemory = process.memoryUsage();
        const duration = Date.now() - startTime;
        const memoryDelta = {
            rss: Math.round((endMemory.rss - startMemory.rss) / 1024 / 1024),
            heapUsed: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024),
            heapTotal: Math.round((endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024)
        };
        console.log(`[bot-core] Job completed successfully: ${jobId}, type: ${jobData.type}, duration: ${duration}ms, memory delta: +${memoryDelta.rss}MB RSS`);
        // Process job completion
        await webhookService.processJobCompletion(jobId, true, result);
    }
    catch (err) {
        // Clear timers on error
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        if (jobTimeout) {
            clearTimeout(jobTimeout);
            jobTimeout = null;
        }
        const error = err instanceof Error ? err : new Error('Unknown error');
        const errorCategory = (0, linkedin_1.categorizeError)(error);
        console.error(`[bot-core] Job failed: ${jobId}, type: ${jobData.type}, errorType: ${errorCategory.type}, error: ${error.message}, description: ${errorCategory.description}`);
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
