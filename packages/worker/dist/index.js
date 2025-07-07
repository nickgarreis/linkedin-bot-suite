"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const dotenv_1 = require("dotenv");
const bot_core_1 = require("@linkedin-bot-suite/bot-core");
(0, dotenv_1.config)();
const queueName = process.env.QUEUE_NAME || 'linkedin-jobs';
const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);
console.log(`Starting LinkedIn Bot Worker...`);
console.log(`Queue: ${queueName}`);
console.log(`Concurrency: ${concurrency}`);
const worker = new bullmq_1.Worker(queueName, bot_core_1.processJob, {
    connection: { url: process.env.REDIS_URL },
    concurrency: 1, // Reduced concurrency for stability
    prefix: process.env.BULLMQ_PREFIX || 'bull',
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Retry stalled jobs only once
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
exports.default = worker;
