import { WebhookPayload } from '@linkedin-bot-suite/shared';
export declare class WebhookService {
    sendWebhook(url: string, payload: WebhookPayload): Promise<{
        success: boolean;
        status: number;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        status?: undefined;
    }>;
    processJobCompletion(jobId: string, success: boolean, result: any, error?: string): Promise<void>;
    private updateWorkflowRunCounters;
}
