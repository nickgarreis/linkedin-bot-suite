"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = exports.jobQueue = void 0;
exports.initSupabase = initSupabase;
const bullmq_1 = require("bullmq");
const supabase_js_1 = require("@supabase/supabase-js");
console.log(`[bot-core] Worker listening on ${process.env.QUEUE_NAME}`);
function initSupabase() {
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
}
const queueName = process.env.QUEUE_NAME || 'jobs';
const prefix = process.env.BULLMQ_PREFIX || 'bull';
const redis = { url: process.env.REDIS_URL };
exports.jobQueue = new bullmq_1.Queue(queueName, {
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
new bullmq_1.QueueEvents(queueName, {
    prefix,
    connection: redis,
}).on('completed', ({ jobId }) => {
    console.log(`[bot-core] Job completed: ${jobId}`);
});
// Export the processor function
var processor_1 = require("./processor");
Object.defineProperty(exports, "processJob", { enumerable: true, get: function () { return processor_1.processJob; } });
