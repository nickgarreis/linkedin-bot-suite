export interface BaseJob {
  id?: string;
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: string;
    delay: number;
  };
  removeOnComplete?: number;
  removeOnFail?: number;
}

export interface InviteJob extends BaseJob {
  type: 'invite';
  profileUrl: string;
  note?: string;
  accountId?: string;
  workflowId?: string;
  n8nWebhookUrl?: string;
}

export interface MessageJob extends BaseJob {
  type: 'message';
  profileUrl: string;
  message: string;
  accountId?: string;
  workflowId?: string;
  n8nWebhookUrl?: string;
}

export interface ProfileViewJob extends BaseJob {
  type: 'profile_view';
  profileUrl: string;
  accountId?: string;
  workflowId?: string;
  n8nWebhookUrl?: string;
}

export interface ApiResearchJob extends BaseJob {
  type: 'api_research';
  profileUrl: string;
  actions?: ('invite' | 'message')[];
  accountId?: string;
  workflowId?: string;
  n8nWebhookUrl?: string;
}

export type LinkedInJob = InviteJob | MessageJob | ProfileViewJob | ApiResearchJob;

export interface JobResult {
  success: boolean;
  jobId: string;
  profileUrl: string;
  action: string;
  message?: string;
  error?: string;
  timestamp: Date;
}

export interface WebhookPayload {
  jobId: string;
  workflowId?: string;
  status: 'completed' | 'failed' | 'retry';
  result: JobResult;
}