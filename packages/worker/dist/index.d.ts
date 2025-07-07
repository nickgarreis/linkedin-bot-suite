import { Worker } from 'bullmq';
import { LinkedInJob } from '@linkedin-bot-suite/shared';
declare const worker: Worker<LinkedInJob, any, string>;
export default worker;
