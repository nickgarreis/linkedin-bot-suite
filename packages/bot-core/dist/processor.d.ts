import { Job } from 'bullmq';
import { LinkedInJob } from '@linkedin-bot-suite/shared';
export declare function processJob(job: Job<LinkedInJob>): Promise<void>;
