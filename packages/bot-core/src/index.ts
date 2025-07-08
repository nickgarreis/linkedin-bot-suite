import { Queue, QueueEvents } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

export const log = pino({ name: 'bot-core' });
log.info(`Worker listening on ${process.env.QUEUE_NAME}`);

export function initSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );
}

const queueName = process.env.QUEUE_NAME || 'jobs';
const prefix    = process.env.BULLMQ_PREFIX || 'bull';
const redis     = { url: process.env.REDIS_URL! };

export const jobQueue = new Queue(queueName, {
  prefix,
  connection: redis,
  defaultJobOptions: {
    // Job retry configuration with exponential backoff
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 second delay
    },
    removeOnComplete: 100,
    removeOnFail: 50,
    // Job timeout configuration
    delay: 0,
    priority: 0,
  },
});

new QueueEvents(queueName, {
  prefix,
  connection: redis,
}).on('completed', ({ jobId }) => {
  log.info({ jobId }, 'Job erledigt');
});

// Export the processor function
export { processJob } from './processor';
