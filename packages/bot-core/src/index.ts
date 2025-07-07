import { Queue, QueueEvents } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

log.info(`Worker listening on ${process.env.QUEUE_NAME}`);

export const log = pino({ name: 'bot-core' });

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
  connection: redis
});

new QueueEvents(queueName, {
  prefix,
  connection: redis
}).on('completed', ({ jobId }) => {
  log.info({ jobId }, '✅ Job erledigt');
});
