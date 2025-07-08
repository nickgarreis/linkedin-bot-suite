"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
const bullmq_1 = require("bullmq");
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const shared_1 = require("@linkedin-bot-suite/shared");
const uuid_1 = require("uuid");
let supabase = null;
function getSupabaseClient() {
    if (!supabase) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE ||
            process.env.SUPABASE_URL === 'https://placeholder.supabase.co') {
            throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in Render dashboard.');
        }
        supabase = (0, supabase_js_1.createClient)(config_1.CONFIG.supabase.url, config_1.CONFIG.supabase.serviceRoleKey);
    }
    return supabase;
}
class JobService {
    constructor() {
        this.queue = null;
        // Lazy initialization - don't connect to Redis until first use
    }
    getQueue() {
        if (!this.queue) {
            this.queue = new bullmq_1.Queue(config_1.CONFIG.bullmq.queueName, {
                connection: { url: config_1.CONFIG.redis.url },
                prefix: config_1.CONFIG.bullmq.prefix,
            });
        }
        return this.queue;
    }
    async createJob(jobData, clientSlug) {
        const jobId = (0, uuid_1.v4)();
        // Log job creation in database
        await getSupabaseClient().from('job_history').insert({
            id: jobId,
            workflow_run_id: jobData.workflowId,
            job_type: jobData.type,
            job_data: jobData,
            status: shared_1.JOB_STATUS.PENDING,
            attempts: 0,
            created_at: new Date().toISOString(),
        });
        // Add job to BullMQ queue
        const job = await this.getQueue().add(jobData.type, {
            ...jobData,
            id: jobId,
            clientSlug,
        }, {
            ...shared_1.DEFAULT_JOB_OPTIONS,
            priority: jobData.priority || 5,
            delay: jobData.delay || 0,
            jobId,
        });
        return {
            jobId,
            queueId: job.id,
            status: 'queued',
            type: jobData.type,
            profileUrl: jobData.profileUrl,
        };
    }
    async createBulkJobs(jobs, clientSlug, workflowId) {
        const workflowRunId = workflowId || (0, uuid_1.v4)();
        // Create workflow run record
        await getSupabaseClient().from('workflow_runs').insert({
            id: workflowRunId,
            workflow_id: workflowId || 'bulk-' + Date.now(),
            status: 'pending',
            started_at: new Date().toISOString(),
            total_jobs: jobs.length,
            completed_jobs: 0,
            failed_jobs: 0,
        });
        const results = [];
        for (const jobData of jobs) {
            try {
                const result = await this.createJob({ ...jobData, workflowId: workflowRunId }, clientSlug);
                results.push(result);
            }
            catch (error) {
                results.push({
                    error: error instanceof Error ? error.message : 'Failed to create job',
                    jobData,
                });
            }
        }
        return {
            workflowRunId,
            totalJobs: jobs.length,
            createdJobs: results.filter(r => !('error' in r)).length,
            failedJobs: results.filter(r => 'error' in r).length,
            jobs: results,
        };
    }
    async getJobStatus(jobId) {
        const job = await this.getQueue().getJob(jobId);
        const { data: jobHistory } = await getSupabaseClient()
            .from('job_history')
            .select('*')
            .eq('id', jobId)
            .single();
        return {
            jobId,
            queueStatus: job ? await job.getState() : 'not_found',
            progress: job ? job.progress : null,
            attempts: job ? job.attemptsMade : 0,
            dbStatus: jobHistory?.status || 'not_found',
            createdAt: jobHistory?.created_at,
            startedAt: jobHistory?.started_at,
            completedAt: jobHistory?.completed_at,
            error: jobHistory?.error_message,
            result: jobHistory?.result,
        };
    }
    async getWorkflowStatus(workflowRunId) {
        const { data: workflowRun } = await getSupabaseClient()
            .from('workflow_runs')
            .select('*')
            .eq('id', workflowRunId)
            .single();
        if (!workflowRun) {
            return { error: 'Workflow run not found' };
        }
        const { data: jobs } = await getSupabaseClient()
            .from('job_history')
            .select('*')
            .eq('workflow_run_id', workflowRunId);
        return {
            workflowRunId,
            status: workflowRun.status,
            totalJobs: workflowRun.total_jobs,
            completedJobs: workflowRun.completed_jobs,
            failedJobs: workflowRun.failed_jobs,
            startedAt: workflowRun.started_at,
            completedAt: workflowRun.completed_at,
            jobs: jobs || [],
        };
    }
    async deleteJob(jobId) {
        const job = await this.getQueue().getJob(jobId);
        if (job) {
            await job.remove();
        }
        await getSupabaseClient()
            .from('job_history')
            .delete()
            .eq('id', jobId);
        return { success: true };
    }
}
exports.JobService = JobService;
