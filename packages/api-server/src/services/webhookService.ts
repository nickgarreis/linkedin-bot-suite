import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { CONFIG } from '../config';
import { WebhookPayload, JOB_STATUS } from '@linkedin-bot-suite/shared';

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE ||
        process.env.SUPABASE_URL === 'https://placeholder.supabase.co') {
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in Render dashboard.');
    }
    supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);
  }
  return supabase;
}

export class WebhookService {
  async sendWebhook(url: string, payload: WebhookPayload) {
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

      return { success: true, status: response.status };
    } catch (error) {
      console.error('Webhook send failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async processJobCompletion(jobId: string, success: boolean, result: any, error?: string) {
    try {
      // Update job history
      const updateData: any = {
        status: success ? JOB_STATUS.COMPLETED : JOB_STATUS.FAILED,
        completed_at: new Date().toISOString(),
      };

      if (success) {
        updateData.result = result;
      } else {
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
        const webhookPayload: WebhookPayload = {
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
    } catch (error) {
      console.error('Error processing job completion:', error);
    }
  }

  private async updateWorkflowRunCounters(workflowRunId: string) {
    const { data: jobs } = await getSupabaseClient()
      .from('job_history')
      .select('status')
      .eq('workflow_run_id', workflowRunId);

    if (!jobs) return;

    const completedJobs = jobs.filter(j => j.status === JOB_STATUS.COMPLETED).length;
    const failedJobs = jobs.filter(j => j.status === JOB_STATUS.FAILED).length;
    const totalJobs = jobs.length;

    // Determine workflow status
    let workflowStatus = 'running';
    if (completedJobs + failedJobs === totalJobs) {
      workflowStatus = failedJobs > 0 ? 'failed' : 'completed';
    }

    const updateData: any = {
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