export declare class WebhookService {
    updateJobStatus(jobId: string, status: string, startedAt?: Date): Promise<void>;
    processJobCompletion(jobId: string, success: boolean, result: any, error?: string): Promise<void>;
    private sendWebhook;
    private updateWorkflowRunCounters;
}
