"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const shared_1 = require("@linkedin-bot-suite/shared");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
class WebhookService {
    async updateJobStatus(jobId, status, startedAt) {
        const updateData = { status };
        if (startedAt) {
            updateData.started_at = startedAt.toISOString();
        }
        else if (status === 'processing') {
            updateData.started_at = new Date().toISOString();
        }
        try {
            await supabase
                .from('job_history')
                .update(updateData)
                .eq('id', jobId);
        }
        catch (error) {
            console.error('Error updating job status:', error);
        }
    }
    async processJobCompletion(jobId, success, result, error) {
        try {
            // Update job history
            const updateData = {
                status: success ? shared_1.JOB_STATUS.COMPLETED : shared_1.JOB_STATUS.FAILED,
                completed_at: new Date().toISOString(),
            };
            if (success && result) {
                updateData.result = result;
            }
            if (!success && error) {
                updateData.error_message = error;
            }
            await supabase
                .from('job_history')
                .update(updateData)
                .eq('id', jobId);
            // Get job details for webhook
            const { data: jobHistory } = await supabase
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
    async sendWebhook(url, payload) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            console.log('Webhook sent successfully:', url);
        }
        catch (error) {
            console.error('Webhook send failed:', error);
        }
    }
    async updateWorkflowRunCounters(workflowRunId) {
        try {
            const { data: jobs } = await supabase
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
            await supabase
                .from('workflow_runs')
                .update(updateData)
                .eq('id', workflowRunId);
        }
        catch (error) {
            console.error('Error updating workflow counters:', error);
        }
    }
}
exports.WebhookService = WebhookService;
