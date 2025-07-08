import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { processJob } from '@linkedin-bot-suite/bot-core';
import { LinkedInJob } from '@linkedin-bot-suite/shared';
import fetch from 'node-fetch';
import Redis from 'ioredis';

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
  connection: { 
    url: process.env.REDIS_URL!,
    // Enhanced Redis connection options with increased timeouts for cloud environments
    retryDelayOnFailover: 100,
    lazyConnect: true,
    maxRetriesPerRequest: 5,
    retryDelayOnClusterDown: 500,
    enableReadyCheck: true,
    family: 4, // Use IPv4
    keepAlive: 15000,
    connectTimeout: 10000,   // Increased from 5000ms to 10000ms
    commandTimeout: 15000,   // Increased from 3000ms to 15000ms
    // Additional stability options
    enableOfflineQueue: false,
    reconnectOnError: (err: Error) => {
      console.log('Redis reconnectOnError triggered:', err.message);
      return err.message.includes('READONLY') || err.message.includes('ECONNRESET');
    },
  },
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


worker.on('error', (err) => {
  console.error('Worker error:', err);
  
  // Enhanced error categorization and logging
  if (err.message.includes('Command timed out')) {
    console.error('❌ Redis command timeout detected:', {
      error: err.message,
      timestamp: new Date().toISOString(),
      suggestion: 'Consider upgrading Redis plan or checking network connectivity'
    });
  } else if (err.message.includes('ECONNREFUSED') || 
             err.message.includes('ETIMEDOUT') ||
             err.message.includes('Connection is closed')) {
    console.error('❌ Redis connection error detected, attempting to reconnect...', {
      error: err.message,
      timestamp: new Date().toISOString()
    });
  } else if (err.message.includes('READONLY')) {
    console.error('❌ Redis in read-only mode (failover in progress):', {
      error: err.message,
      timestamp: new Date().toISOString()
    });
  } else {
    console.error('❌ Unhandled worker error:', {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
  }
});

worker.on('stalled', (jobId) => {
  console.warn(`Job ${jobId} stalled`);
});

// Redis connection monitoring - using manual Redis client for monitoring

let redisMonitorClient: Redis | null = null;

async function initRedisMonitoring() {
  try {
    redisMonitorClient = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,   // Increased from 5000ms to 10000ms
      commandTimeout: 10000,   // Increased from 2000ms to 10000ms
      enableOfflineQueue: false,
      lazyConnect: false,
      reconnectOnError: (err: Error) => {
        console.log('Redis monitor reconnectOnError triggered:', err.message);
        return err.message.includes('READONLY') || err.message.includes('ECONNRESET');
      },
    });
    
    redisMonitorClient.on('connect', () => {
      console.log('✅ Redis monitor connected successfully');
    });

    redisMonitorClient.on('ready', () => {
      console.log('✅ Redis monitor ready for commands');
    });

    redisMonitorClient.on('error', (err: Error) => {
      console.error('❌ Redis monitor connection error:', err.message);
    });

    redisMonitorClient.on('disconnect', () => {
      console.warn('⚠️ Redis monitor connection closed');
    });

    redisMonitorClient.on('reconnecting', () => {
      console.log('🔄 Redis monitor reconnecting...');
    });

    // ioredis connects automatically
  } catch (error) {
    console.error('Failed to initialize Redis monitoring:', error);
  }
}

// Initialize Redis monitoring
initRedisMonitoring();

// Enhanced health check function with detailed diagnostics
async function performHealthCheck() {
  try {
    // Check Redis connection with timeout measurement
    let redisHealthy = false;
    let redisPingTime = 0;
    
    if (redisMonitorClient) {
      try {
        const startTime = Date.now();
        await redisMonitorClient.ping();
        redisPingTime = Date.now() - startTime;
        redisHealthy = true;
      } catch (pingError) {
        const errorMessage = pingError instanceof Error ? pingError.message : String(pingError);
        console.error('❌ Redis ping failed:', {
          error: errorMessage,
          timestamp: new Date().toISOString(),
          clientStatus: redisMonitorClient.status
        });
      }
    }
    
    // Check worker status and connection health
    const isRunning = !worker.closing;
    const memoryUsage = process.memoryUsage();
    
    const healthStatus = {
      redis: redisHealthy,
      worker: isRunning,
      activeJobs,
      redisPingTime: redisPingTime > 0 ? `${redisPingTime}ms` : 'N/A',
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`Health check: Redis ${redisHealthy ? '✅' : '❌'}, Worker ${isRunning ? '✅' : '❌'}, Active jobs: ${activeJobs}, Ping: ${redisPingTime}ms, Memory: ${healthStatus.memoryUsage.rss}`);
    
    // Alert on slow Redis responses
    if (redisHealthy && redisPingTime > 5000) {
      console.warn('⚠️ Redis response time is slow:', redisPingTime + 'ms');
    }
    
    return healthStatus;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Health check failed:', error);
    return { 
      redis: false, 
      worker: false, 
      activeJobs, 
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
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
async function gracefulShutdown(signal: string) {
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
      console.log(`Waiting for ${activeJobs} active jobs to complete... (${waitTime/1000}s)`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    if (activeJobs > 0) {
      console.warn(`Forcing shutdown with ${activeJobs} active jobs remaining`);
    } else {
      console.log('All active jobs completed successfully');
    }
    
    // Close the worker
    await worker.close();
    console.log('Worker closed successfully');
    
    process.exit(0);
  } catch (error) {
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

export default worker;