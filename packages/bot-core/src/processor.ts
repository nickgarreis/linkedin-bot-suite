import { Job } from 'bullmq';
import { log } from './index';

export async function processJob(job: Job) {
  log.info({ id: job.id, data: job.data }, '🚧 Job received – processor stub');
  // TODO: Implement real invite / message handling here.
}
