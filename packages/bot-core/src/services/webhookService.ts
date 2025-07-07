import { createClient } from '@supabase/supabase-js';
import { WebhookPayload, JOB_STATUS } from '@linkedin-bot-suite/shared';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export class WebhookService {
  async updateJobStatus(jobId: string, status: string, startedAt?: Date) {
    const updateData: any = { status };
    
    if (startedAt) {
      updateData.started_at = startedAt.toISOString();
    } else if (status === 'processing') {
      updateData.started_at = new Date().toISOString();
    }

    try {
      await supabase
        .from('job_history')
        .update(updateData)
        .eq('id', jobId);
    } catch (error) {
      console.error('Error updating job status:', error);
    }
  }

  async processJobCompletion(jobId: string, success: boolean, result: any, error?: string) {
    try {
      // Update job history
      const updateData: any = {
        status: success ? JOB_STATUS.COMPLETED : JOB_STATUS.FAILED,
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

  private async sendWebhook(url: string, payload: WebhookPayload) {
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
    } catch (error) {
      console.error('Webhook send failed:', error);
    }
  }

  private async updateWorkflowRunCounters(workflowRunId: string) {
    try {
      const { data: jobs } = await supabase
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

      await supabase
        .from('workflow_runs')
        .update(updateData)
        .eq('id', workflowRunId);
    } catch (error) {
      console.error('Error updating workflow counters:', error);
    }
  }
}