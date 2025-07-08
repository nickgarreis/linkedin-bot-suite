"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("../config");
const shared_1 = require("@linkedin-bot-suite/shared");
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
class WebhookService {
    async sendWebhook(url, payload) {
        try {
            const response = await (0, node_fetch_1.default)(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return { success: true, status: response.status };
        }
        catch (error) {
            console.error('Webhook send failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async processJobCompletion(jobId, success, result, error) {
        try {
            // Update job history
            const updateData = {
                status: success ? shared_1.JOB_STATUS.COMPLETED : shared_1.JOB_STATUS.FAILED,
                completed_at: new Date().toISOString(),
            };
            if (success) {
                updateData.result = result;
            }
            else {
                updateData.error_message = error;
            }
            await getSupabaseClient()
                .from('job_history')
                .update(updateData)
                .eq('id', jobId);
            // Get job details for webhook
            const { data: jobHistory } = await getSupabaseClient()
                .from('job_history')
                .select('*')
                .eq('id', jobId)
                .single();
            if (!jobHistory) {
                console.error('Job history not found for job:', jobId);
                return;
            }
            // Update workflow run counters
            if (jobHistory.workflow_run_id) {
                await this.updateWorkflowRunCounters(jobHistory.workflow_run_id);
            }
            // Send webhook if URL is provided
            const webhookUrl = jobHistory.job_data?.n8nWebhookUrl;
            if (webhookUrl) {
                const webhookPayload = {
                    jobId,
                    workflowId: jobHistory.workflow_run_id,
                    status: success ? 'completed' : 'failed',
                    result: {
                        success,
                        jobId,
                        profileUrl: jobHistory.job_data?.profileUrl,
                        action: jobHistory.job_type,
                        message: success ? 'Job completed successfully' : error,
                        error: success ? undefined : error,
                        timestamp: new Date(),
                    },
                };
                await this.sendWebhook(webhookUrl, webhookPayload);
            }
        }
        catch (error) {
            console.error('Error processing job completion:', error);
        }
    }
    async updateWorkflowRunCounters(workflowRunId) {
        const { data: jobs } = await getSupabaseClient()
            .from('job_history')
            .select('status')
            .eq('workflow_run_id', workflowRunId);
        if (!jobs)
            return;
        const completedJobs = jobs.filter(j => j.status === shared_1.JOB_STATUS.COMPLETED).length;
        const failedJobs = jobs.filter(j => j.status === shared_1.JOB_STATUS.FAILED).length;
        const totalJobs = jobs.length;
        // Determine workflow status
        let workflowStatus = 'running';
        if (completedJobs + failedJobs === totalJobs) {
            workflowStatus = failedJobs > 0 ? 'failed' : 'completed';
        }
        const updateData = {
            completed_jobs: completedJobs,
            failed_jobs: failedJobs,
            status: workflowStatus,
        };
        if (workflowStatus === 'completed' || workflowStatus === 'failed') {
            updateData.completed_at = new Date().toISOString();
        }
        await getSupabaseClient()
            .from('workflow_runs')
            .update(updateData)
            .eq('id', workflowRunId);
    }
}
exports.WebhookService = WebhookService;
