"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const dotenv_1 = require("dotenv");
const bot_core_1 = require("@linkedin-bot-suite/bot-core");
const node_fetch_1 = __importDefault(require("node-fetch"));
const ioredis_1 = __importDefault(require("ioredis"));
(0, dotenv_1.config)();
async function validateCookies() {
    try {
        const cookies = process.env.LINKEDIN_COOKIES_JSON || '[]';
        const liAt = JSON.parse(cookies).find((c) => c.name === 'li_at')?.value;
        if (!liAt)
            return false;
        const resp = await (0, node_fetch_1.default)('https://www.linkedin.com/feed', {
            headers: { cookie: `li_at=${liAt}` },
            redirect: 'manual' // don't follow 302
        });
        return resp.status === 200; // 200 == authenticated
    }
    catch {
        return false;
    }
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
const worker = new bullmq_1.Worker(queueName, bot_core_1.processJob, {
    connection: {
        url: process.env.REDIS_URL,
        // Enhanced Redis connection options
        retryDelayOnFailover: 1000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableReadyCheck: true,
        family: 4, // Use IPv4
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
    },
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
worker.on('error', (err) => {
    console.error('Worker error:', err);
    // Check if it's a Redis connection error
    if (err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('Connection is closed')) {
        console.error('Redis connection error detected, attempting to reconnect...');
        // The worker will automatically attempt to reconnect due to Redis client settings
    }
});
worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled`);
});
// Redis connection monitoring - using manual Redis client for monitoring
let redisMonitorClient = null;
async function initRedisMonitoring() {
    try {
        redisMonitorClient = new ioredis_1.default(process.env.REDIS_URL);
        redisMonitorClient.on('connect', () => {
            console.log('✅ Redis monitor connected successfully');
        });
        redisMonitorClient.on('ready', () => {
            console.log('✅ Redis monitor ready for commands');
        });
        redisMonitorClient.on('error', (err) => {
            console.error('❌ Redis monitor connection error:', err.message);
        });
        redisMonitorClient.on('disconnect', () => {
            console.warn('⚠️ Redis monitor connection closed');
        });
        redisMonitorClient.on('reconnecting', () => {
            console.log('🔄 Redis monitor reconnecting...');
        });
        // ioredis connects automatically
    }
    catch (error) {
        console.error('Failed to initialize Redis monitoring:', error);
    }
}
// Initialize Redis monitoring
initRedisMonitoring();
// Health check function
async function performHealthCheck() {
    try {
        // Check Redis connection
        let redisHealthy = false;
        if (redisMonitorClient) {
            try {
                await redisMonitorClient.ping();
                redisHealthy = true;
            }
            catch (pingError) {
                console.error('Redis ping failed:', pingError);
            }
        }
        // Check worker status
        const isRunning = !worker.closing;
        console.log(`Health check: Redis ${redisHealthy ? '✅' : '❌'}, Worker ${isRunning ? '✅' : '❌'}, Active jobs: ${activeJobs}`);
        return { redis: redisHealthy, worker: isRunning, activeJobs };
    }
    catch (error) {
        console.error('Health check failed:', error);
        return { redis: false, worker: false, activeJobs };
    }
}
// Periodic health checks every 30 seconds
setInterval(performHealthCheck, 30000);
// Track active jobs for graceful shutdown
let activeJobs = 0;
let isShuttingDown = false;
worker.on('active', (job) => {
    activeJobs++;
    console.log(`Processing job ${job.id}: ${job.data.type} - ${job.data.profileUrl} (Active: ${activeJobs})`);
});
worker.on('completed', (job, result) => {
    activeJobs--;
    console.log(`Job ${job.id} completed successfully (Active: ${activeJobs}):`, result);
});
worker.on('failed', (job, err) => {
    activeJobs--;
    console.error(`Job ${job?.id} failed (Active: ${activeJobs}):`, err.message);
});
// Enhanced graceful shutdown with job completion handling
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log(`${signal} received again, forcing shutdown...`);
        process.exit(1);
    }
    isShuttingDown = true;
    console.log(`${signal} received, shutting down worker gracefully...`);
    console.log(`Active jobs: ${activeJobs}`);
    try {
        // Stop accepting new jobs
        await worker.pause();
        console.log('Worker paused, no new jobs will be processed');
        // Wait for active jobs to complete (max 60 seconds)
        const maxWaitTime = 60000; // 60 seconds
        const checkInterval = 1000; // 1 second
        let waitTime = 0;
        while (activeJobs > 0 && waitTime < maxWaitTime) {
            console.log(`Waiting for ${activeJobs} active jobs to complete... (${waitTime / 1000}s)`);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
        }
        if (activeJobs > 0) {
            console.warn(`Forcing shutdown with ${activeJobs} active jobs remaining`);
        }
        else {
            console.log('All active jobs completed successfully');
        }
        // Close the worker
        await worker.close();
        console.log('Worker closed successfully');
        process.exit(0);
    }
    catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});
exports.default = worker;
