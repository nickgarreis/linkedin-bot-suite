import { LinkedInJob } from '@linkedin-bot-suite/shared';
export declare class JobService {
    private queue;
    constructor();
    private getQueue;
    createJob(jobData: LinkedInJob, clientSlug: string): Promise<{
        jobId: string;
        queueId: string | undefined;
        status: string;
        type: "message" | "invite" | "profile_view";
        profileUrl: string;
    }>;
    createBulkJobs(jobs: LinkedInJob[], clientSlug: string, workflowId?: string): Promise<{
        workflowRunId: string;
        totalJobs: number;
        createdJobs: number;
        failedJobs: number;
        jobs: ({
            jobId: string;
            queueId: string | undefined;
            status: string;
            type: "message" | "invite" | "profile_view";
            profileUrl: string;
        } | {
            error: string;
            jobData: LinkedInJob;
        })[];
    }>;
    getJobStatus(jobId: string): Promise<{
        jobId: string;
        queueStatus: any;
        progress: any;
        attempts: any;
        dbStatus: any;
        createdAt: any;
        startedAt: any;
        completedAt: any;
        error: any;
        result: any;
    }>;
    getWorkflowStatus(workflowRunId: string): Promise<{
        error: string;
        workflowRunId?: undefined;
        status?: undefined;
        totalJobs?: undefined;
        completedJobs?: undefined;
        failedJobs?: undefined;
        startedAt?: undefined;
        completedAt?: undefined;
        jobs?: undefined;
    } | {
        workflowRunId: string;
        status: any;
        totalJobs: any;
        completedJobs: any;
        failedJobs: any;
        startedAt: any;
        completedAt: any;
        jobs: any[];
        error?: undefined;
    }>;
    deleteJob(jobId: string): Promise<{
        success: boolean;
    }>;
}
