import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext, sendInvitation, sendMessage, viewProfile, checkPageHealth, checkBrowserHealth, cleanupUserDataDir } from '@linkedin-bot-suite/linkedin';
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
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    // Check for authentication errors
    if (errorMessage.includes('authentication failed') || 
        errorMessage.includes('ERR_TOO_MANY_REDIRECTS') ||
        errorMessage.includes('redirected to login page') ||
        errorMessage.includes('cookies may be invalid')) {
      log.error({ jobId, error: errorMessage }, 'Authentication error - cookies may be expired');
      // Don't retry auth errors
      await webhookService.processJobCompletion(jobId, false, null, 'Authentication failed - please update LinkedIn cookies');
      return; // Don't re-throw, no point retrying with bad cookies
    }
    
    // Check for browser-specific errors
    if (errorMessage.includes('Browser') || 
        errorMessage.includes('Page') || 
        errorMessage.includes('about:blank') ||
        errorMessage.includes('Not attached to an active page')) {
      log.error({ jobId, error: errorMessage }, 'Browser stability error');
      await webhookService.processJobCompletion(jobId, false, null, `Browser error: ${errorMessage}`);
    } else {
      log.error(
        { jobId, type: jobData.type, profileUrl: jobData.profileUrl, err },
        'Job failed'
      );

      // Process job failure
      await webhookService.processJobCompletion(jobId, false, null, errorMessage);
    }
    
    throw err; // Re-throw to let BullMQ handle retries
    
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
