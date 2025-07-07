import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext, sendInvitation, sendMessage, viewProfile, checkPageHealth, checkBrowserHealth, cleanupUserDataDir, categorizeError } from '@linkedin-bot-suite/linkedin';
import { LinkedInJob, JOB_TYPES } from '@linkedin-bot-suite/shared';
import { WebhookService } from './services/webhookService';
import { Browser, Page } from 'puppeteer';

const webhookService = new WebhookService();

/**
 * Safely close browser with timeout
 */
async function safeBrowserClose(browser: Browser, timeoutMs: number = 5000): Promise<void> {
  try {
    await Promise.race([
      browser.close(),
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('Browser close timeout')), timeoutMs)
      )
    ]);
    console.log('Browser closed successfully');
  } catch (error) {
    console.error('Failed to close browser gracefully:', error);
    
    // Force kill if still connected
    if (browser.isConnected()) {
      try {
        const process = browser.process();
        if (process) {
          process.kill('SIGKILL');
          console.log('Browser process killed');
        }
      } catch (killError) {
        console.error('Failed to kill browser process:', killError);
      }
    }
  }
}

export async function processJob(job: Job<LinkedInJob>): Promise<void> {
  const jobData = job.data;
  const jobId = job.id!;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let userDataDir: string | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  log.info({ jobId, type: jobData.type }, 'Processing job');

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
      initLinkedInContext(process.env.PROXY_URL ?? ''),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Browser initialization timeout')), 90000)
      )
    ]);
    
    browser = initResult.browser;
    page = initResult.page;
    userDataDir = initResult.userDataDir;

    // Verify browser and page are healthy
    const browserHealthy = await checkBrowserHealth(browser);
    const pageHealth = await checkPageHealth(page);
    
    if (!browserHealthy || !pageHealth.isHealthy) {
      throw new Error(`Browser/page health check failed: ${pageHealth.error || 'Browser unhealthy'}`);
    }

    console.log(`Processing ${jobData.type} job for ${jobData.profileUrl}`);
    
    let result: any;

    switch (jobData.type) {
      case JOB_TYPES.INVITE:
        result = await sendInvitation(page, jobData.profileUrl, jobData.note);
        break;
      
      case JOB_TYPES.MESSAGE:
        result = await sendMessage(page, jobData.profileUrl, jobData.message);
        break;
      
      case JOB_TYPES.PROFILE_VIEW:
        result = await viewProfile(page, jobData.profileUrl);
        break;
      
      default:
        throw new Error(`Unknown job type: ${(jobData as any).type}`);
    }

    // Clear heartbeat before completion
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    
    log.info(
      { jobId, type: jobData.type, profileUrl: jobData.profileUrl },
      'Job completed successfully'
    );

    // Process job completion
    await webhookService.processJobCompletion(jobId, true, result);
    
  } catch (err) {
    // Clear heartbeat on error
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    
    const error = err instanceof Error ? err : new Error('Unknown error');
    const errorCategory = categorizeError(error);
    
    log.error({ 
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
    
  } finally {
    // Clean up resources with proper error handling
    if (page && !page.isClosed()) {
      try {
        await page.close();
        console.log('Page closed successfully');
      } catch (error) {
        console.error('Failed to close page:', error);
      }
    }
    
    if (browser) {
      await safeBrowserClose(browser);
    }
    
    // Clean up user data directory
    if (userDataDir) {
      try {
        await cleanupUserDataDir(userDataDir);
      } catch (error) {
        console.error('Failed to cleanup user data directory:', error);
      }
    }
  }
}
