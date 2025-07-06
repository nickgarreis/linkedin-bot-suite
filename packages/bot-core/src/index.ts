import { Queue, QueueEvents } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

export const log = pino({ name: 'bot-core' });

export function initSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );
}

export const jobQueue = new Queue(process.env.QUEUE_NAME || 'jobs', {
  connection: { url: process.env.REDIS_URL! }
});

new QueueEvents(process.env.QUEUE_NAME || 'jobs', {
  connection: { url: process.env.REDIS_URL! }
}).on('completed', ({ jobId }) => log.info({ jobId }, '✅ Job done'));
