import { Queue } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';
import { LinkedInJob, DEFAULT_JOB_OPTIONS, JOB_STATUS } from '@linkedin-bot-suite/shared';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);

export class JobService {
  private queue: Queue | null = null;

  constructor() {
    // Lazy initialization - don't connect to Redis until first use
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(CONFIG.bullmq.queueName, {
        connection: { url: CONFIG.redis.url },
        prefix: CONFIG.bullmq.prefix,
      });
    }
    return this.queue;
  }

  async createJob(jobData: LinkedInJob, clientSlug: string) {
    const jobId = uuidv4();
    
    // Log job creation in database
    await supabase.from('job_history').insert({
      id: jobId,
      workflow_run_id: jobData.workflowId,
      job_type: jobData.type,
      job_data: jobData,
      status: JOB_STATUS.PENDING,
      attempts: 0,
      created_at: new Date().toISOString(),
    });

    // Add job to BullMQ queue
    const job = await this.getQueue().add(
      jobData.type,
      {
        ...jobData,
        id: jobId,
        clientSlug,
      },
      {
        ...DEFAULT_JOB_OPTIONS,
        priority: jobData.priority || 5,
        delay: jobData.delay || 0,
        jobId,
      }
    );

    return {
      jobId,
      queueId: job.id,
      status: 'queued',
      type: jobData.type,
      profileUrl: jobData.profileUrl,
    };
  }

  async createBulkJobs(jobs: LinkedInJob[], clientSlug: string, workflowId?: string) {
    const workflowRunId = workflowId || uuidv4();
    
    // Create workflow run record
    await supabase.from('workflow_runs').insert({
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
        const result = await this.createJob(
          { ...jobData, workflowId: workflowRunId },
          clientSlug
        );
        results.push(result);
      } catch (error) {
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

  async getJobStatus(jobId: string) {
    const job = await this.getQueue().getJob(jobId);
    const { data: jobHistory } = await supabase
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

  async getWorkflowStatus(workflowRunId: string) {
    const { data: workflowRun } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', workflowRunId)
      .single();

    if (!workflowRun) {
      return { error: 'Workflow run not found' };
    }

    const { data: jobs } = await supabase
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

  async deleteJob(jobId: string) {
    const job = await this.getQueue().getJob(jobId);
    if (job) {
      await job.remove();
    }
    
    await supabase
      .from('job_history')
      .delete()
      .eq('id', jobId);

    return { success: true };
  }
}