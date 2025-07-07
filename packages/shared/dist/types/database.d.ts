export interface LinkedInAccount {
    id: string;
    client_slug: string;
    cookies_url: string;
    proxy?: string;
    daily_limit: number;
    invites_sent: number;
    updated_at: Date;
}
export interface OutreachLog {
    id: number;
    account_id: string;
    type: string;
    target_url: string;
    status: string;
    created_at: Date;
    meta?: Record<string, any>;
}
export interface WorkflowRun {
    id: string;
    workflow_id: string;
    n8n_execution_id?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    started_at: Date;
    completed_at?: Date;
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    meta?: Record<string, any>;
}
export interface JobHistory {
    id: string;
    workflow_run_id?: string;
    job_type: string;
    job_data: Record<string, any>;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
    attempts: number;
    created_at: Date;
    started_at?: Date;
    completed_at?: Date;
    error_message?: string;
    result?: Record<string, any>;
}
export interface ApiKey {
    id: string;
    name: string;
    key_hash: string;
    client_slug: string;
    permissions: string[];
    expires_at?: Date;
    created_at: Date;
    last_used_at?: Date;
    is_active: boolean;
}
