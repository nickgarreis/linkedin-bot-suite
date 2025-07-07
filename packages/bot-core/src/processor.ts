import { Job } from 'bullmq';
import { log } from './index';
import { initLinkedInContext } from '../../linkedin/auth';
import { sendInvitation } from '../../linkedin/invite';

/** Typ­definition für Invite-Jobs (andere Job-Typen kannst du hier später erweitern). */
interface InviteJob {
  type: 'invite';
  profileUrl: string;
  note?: string;
}

export async function processJob(job: Job<InviteJob>): Promise<void> {
  if (job.data.type !== 'invite') {
    log.warn({ jobId: job.id }, 'Unbekannter Job-Typ – wird ignoriert');
    return;
  }

  const { profileUrl, note } = job.data;

  /** Optionales Proxy aus ENV (leer = kein Proxy) */
  const { browser, context } = await initLinkedInContext(process.env.PROXY_URL ?? '');

  try {
    const page = await context.newPage();
    await sendInvitation(page, profileUrl, note);

    log.info(
      { jobId: job.id, profileUrl },
      'Invite-Job erfolgreich abgeschlossen'
    );
  } catch (err) {
    log.error(
      { jobId: job.id, profileUrl, err },
      'Invite-Job fehlgeschlagen'
    );
    throw err; // sorgt dafür, dass BullMQ den Job ggf. erneut versucht
  } finally {
    await browser.close(); // immer aufräumen – auch bei Fehlern
  }
}
