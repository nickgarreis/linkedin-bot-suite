import { Worker } from 'bullmq';
import { processJob } from '../../packages/bot-core/src/processor';

new Worker(process.env.QUEUE_NAME || 'jobs', processJob, {
  connection: { url: process.env.REDIS_URL! },
  concurrency: Number(process.env.WORKER_CONCURRENCY || 2)
});
