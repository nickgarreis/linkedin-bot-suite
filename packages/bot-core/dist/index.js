"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = exports.jobQueue = exports.log = void 0;
exports.initSupabase = initSupabase;
const bullmq_1 = require("bullmq");
const supabase_js_1 = require("@supabase/supabase-js");
const pino_1 = __importDefault(require("pino"));
exports.log = (0, pino_1.default)({ name: 'bot-core' });
exports.log.info(`Worker listening on ${process.env.QUEUE_NAME}`);
function initSupabase() {
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
}
const queueName = process.env.QUEUE_NAME || 'jobs';
const prefix = process.env.BULLMQ_PREFIX || 'bull';
const redis = { url: process.env.REDIS_URL };
exports.jobQueue = new bullmq_1.Queue(queueName, {
    prefix,
    connection: redis,
});
new bullmq_1.QueueEvents(queueName, {
    prefix,
    connection: redis,
}).on('completed', ({ jobId }) => {
    exports.log.info({ jobId }, 'Job erledigt');
});
// Export the processor function
var processor_1 = require("./processor");
Object.defineProperty(exports, "processJob", { enumerable: true, get: function () { return processor_1.processJob; } });
