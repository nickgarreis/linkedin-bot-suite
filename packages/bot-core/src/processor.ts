import { Job } from 'bullmq';
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
  let jobTimeout: NodeJS.Timeout | null = null;
  
  // Memory monitoring
  const startMemory = process.memoryUsage();
  const startTime = Date.now();
  
  console.log(`[bot-core] Processing job started: ${jobId}, type: ${jobData.type}, memory: ${Math.round(startMemory.rss / 1024 / 1024)}MB RSS`);

  try {
    // Update job status to processing
    await webhookService.updateJobStatus(jobId, 'processing');

    // Set job timeout (5 minutes max per job)
    const jobTimeoutMs = 5 * 60 * 1000; // 5 minutes
    jobTimeout = setTimeout(() => {
      const error = new Error(`Job ${jobId} timed out after ${jobTimeoutMs/1000} seconds`);
      console.error(`[bot-core] Job timeout: ${jobId}, timeout: ${jobTimeoutMs}ms`);
      throw error;
    }, jobTimeoutMs);

    // Add heartbeat interval to prevent job stalling with enhanced memory monitoring
    heartbeat = setInterval(() => {
      const currentMemory = process.memoryUsage();
      const memoryIncrease = {
        rss: Math.round((currentMemory.rss - startMemory.rss) / 1024 / 1024),
        heapUsed: Math.round((currentMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024),
        heapTotal: Math.round((currentMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024)
      };
      
      job.updateProgress(50); // Keep job alive
      console.log(`Heartbeat for job ${jobId} - Memory delta: RSS +${memoryIncrease.rss}MB, Heap +${memoryIncrease.heapUsed}MB`);
      
      // Stricter memory leak detection and prevention
      if (memoryIncrease.rss > 200) { // Critical memory usage - reduced from 300MB
        console.error(`⚠️ CRITICAL: Job ${jobId} using excessive memory: +${memoryIncrease.rss}MB RSS - force terminating job`);
        throw new Error(`Job terminated due to excessive memory usage: +${memoryIncrease.rss}MB RSS`);
      } else if (memoryIncrease.rss > 150) { // Warning threshold - reduced from 200MB
        console.warn(`⚠️ Job ${jobId} using high memory: +${memoryIncrease.rss}MB RSS`);
        
        // Force garbage collection if available
        if (global.gc) {
          console.log('Running garbage collection...');
          global.gc();
        }
      }
      
      // Check browser health if available
      if (browser && browser.isConnected()) {
        browser.pages().then(pages => {
          console.log(`Browser has ${pages.length} pages open`);
          // Close any extra pages beyond the main one
          if (pages.length > 2) {
            console.warn(`Too many browser pages open (${pages.length}), closing extras`);
            pages.slice(2).forEach(async (extraPage) => {
              try {
                if (!extraPage.isClosed()) {
                  await extraPage.close();
                }
              } catch (err) {
                console.error('Failed to close extra page:', err);
              }
            });
          }
        }).catch(err => console.error('Failed to check browser pages:', err));
      }
    }, 10000); // Every 10 seconds

    // Initialize browser context with timeout
    console.log('Initializing browser context...');
    const initResult = await Promise.race([
      initLinkedInContext(process.env.PROXY_URL ?? ''),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Browser initialization timeout')), 60000)  // Reduced from 90s to 60s
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
    
  } catch (err) {
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
    const errorCategory = categorizeError(error);
    
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
