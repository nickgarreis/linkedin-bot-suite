import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext, sendInvitation, sendMessage, viewProfile } from '@linkedin-bot-suite/linkedin';
import { LinkedInJob, JOB_TYPES } from '@linkedin-bot-suite/shared';
import { WebhookService } from './services/webhookService';

const webhookService = new WebhookService();

export async function processJob(job: Job<LinkedInJob>): Promise<void> {
  const jobData = job.data;
  const jobId = job.id!;

  log.info({ jobId, type: jobData.type }, 'Processing job');

  // Update job status to processing
  await webhookService.updateJobStatus(jobId, 'processing');

  const { browser, context } = await initLinkedInContext(process.env.PROXY_URL ?? '');
  
  try {
    const page = await context.newPage();
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

    log.info(
      { jobId, type: jobData.type, profileUrl: jobData.profileUrl },
      'Job completed successfully'
    );

    // Process job completion
    await webhookService.processJobCompletion(jobId, true, result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    log.error(
      { jobId, type: jobData.type, profileUrl: jobData.profileUrl, err },
      'Job failed'
    );

    // Process job failure
    await webhookService.processJobCompletion(jobId, false, null, errorMessage);
    
    throw err; // Re-throw to let BullMQ handle retries
  } finally {
    await browser.close();
  }
}
