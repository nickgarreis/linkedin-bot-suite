import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext } from '../../linkedin/auth';
import { sendInvitation } from '../../linkedin/invite';

/**
 * Erwartete Job-Payload:
 * { type: 'invite', profileUrl: string, note?: string }
 */
export async function processJob(job: Job) {
  try {
    if (job.data.type !== 'invite') {
      log.warn({ jobId: job.id }, 'Unbekannter Job-Typ');
      return;
    }

    const { profileUrl, note } = job.data;

    // Browser-Session starten
    const { browser, context } = await initLinkedInContext(
      process.env.LINKEDIN_COOKIES_PATH!,
      process.env.PROXY_URL
    );

    const page = await context.newPage();
    await sendInvitation(page, profileUrl, note);
    await browser.close();

    log.info({ jobId: job.id }, 'Invite-Job erfolgreich');
  } catch (err) {
    log.error({ err, jobId: job.id }, 'Invite-Job fehlgeschlagen');
    throw err; // BullMQ → Job als failed markieren
  }
}
