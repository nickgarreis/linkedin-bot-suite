import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext } from '../../linkedin/auth';
import { sendInvitation } from '../../linkedin/invite';

export async function processJob(job: Job) {
  if (job.data.type !== 'invite') {
    log.warn({ jobId: job.id }, 'Unbekannter Job-Typ');
    return;
  }

  const { profileUrl, note } = job.data;
  const { browser, context } = await initLinkedInContext(process.env.PROXY_URL);

  const page = await context.newPage();
  await sendInvitation(page, profileUrl, note);
  await browser.close();

  log.info({ jobId: job.id }, 'Invite-Job erfolgreich');
}
