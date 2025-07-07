import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { processJob } from '@linkedin-bot-suite/bot-core';
import { LinkedInJob } from '@linkedin-bot-suite/shared';
import fetch from 'node-fetch';

config();

async function validateCookies(): Promise<boolean> {
  try {
    const cookies = process.env.LINKEDIN_COOKIES_JSON || '[]';
    const liAt = JSON.parse(cookies).find((c: any) => c.name === 'li_at')?.value;
    if (!liAt) return false;

    const resp = await fetch('https://www.linkedin.com/feed', {
      headers: { cookie: `li_at=${liAt}` },
      redirect: 'manual'          // don't follow 302
    });
    return resp.status === 200;   // 200 == authenticated
  } catch { return false; }
}

const queueName = process.env.QUEUE_NAME || 'linkedin-jobs';
const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);

console.log(`Starting LinkedIn Bot Worker...`);
console.log(`Queue: ${queueName}`);
console.log(`Concurrency: ${concurrency}`);

// Validate cookies at startup
(async () => {
  if (!(await validateCookies())) {
    console.error('❌ LinkedIn cookies invalid at startup – exiting.');
    process.exit(1);
  }
  console.log('✅ LinkedIn cookies validated successfully at startup');
})();

const worker = new Worker<LinkedInJob>(queueName, processJob, {
  connection: { url: process.env.REDIS_URL! },
  concurrency: 1, // Reduced concurrency for stability
  prefix: process.env.BULLMQ_PREFIX || 'bull',
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  stalledInterval: 30000,  // Check for stalled jobs every 30s
  maxStalledCount: 1,      // Retry stalled jobs only once
});

worker.on('ready', () => {
  console.log('Worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  console.log(`Processing job ${job.id}: ${job.data.type} - ${job.data.profileUrl}`);
});

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed successfully:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`Job ${jobId} stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down worker gracefully...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down worker gracefully...');
  await worker.close();
  process.exit(0);
});

export default worker;