import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { processJob } from '@linkedin-bot-suite/bot-core';
import { LinkedInJob } from '@linkedin-bot-suite/shared';

config();

const queueName = process.env.QUEUE_NAME || 'linkedin-jobs';
const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);

console.log(`Starting LinkedIn Bot Worker...`);
console.log(`Queue: ${queueName}`);
console.log(`Concurrency: ${concurrency}`);

const worker = new Worker<LinkedInJob>(queueName, processJob, {
  connection: { url: process.env.REDIS_URL! },
  concurrency,
  prefix: process.env.BULLMQ_PREFIX || 'bull',
  removeOnComplete: 100,
  removeOnFail: 50,
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