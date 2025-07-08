export declare const JOB_TYPES: {
    readonly INVITE: "invite";
    readonly MESSAGE: "message";
    readonly PROFILE_VIEW: "profile_view";
    readonly API_RESEARCH: "api_research";
};
export declare const JOB_STATUS: {
    readonly PENDING: "pending";
    readonly PROCESSING: "processing";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly RETRY: "retry";
};
export declare const WORKFLOW_STATUS: {
    readonly PENDING: "pending";
    readonly RUNNING: "running";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
};
export declare const API_PERMISSIONS: {
    readonly JOBS_CREATE: "jobs:create";
    readonly JOBS_READ: "jobs:read";
    readonly JOBS_DELETE: "jobs:delete";
    readonly WEBHOOKS_RECEIVE: "webhooks:receive";
    readonly ACCOUNTS_READ: "accounts:read";
    readonly ACCOUNTS_MANAGE: "accounts:manage";
};
export declare const RATE_LIMITS: {
    readonly DEFAULT: {
        readonly windowMs: number;
        readonly max: 100;
    };
    readonly WEBHOOK: {
        readonly windowMs: number;
        readonly max: 60;
    };
    readonly BULK: {
        readonly windowMs: number;
        readonly max: 10;
    };
};
export declare const DEFAULT_JOB_OPTIONS: {
    readonly attempts: 3;
    readonly backoff: {
        readonly type: "exponential";
        readonly delay: 5000;
    };
    readonly removeOnComplete: 100;
    readonly removeOnFail: 50;
};
export declare const LINKEDIN_SELECTORS: {
    readonly CONNECT_BUTTON: string;
    readonly NOTE_BUTTON: string;
    readonly SEND_BUTTON: string;
    readonly MESSAGE_BUTTON: string;
    readonly MESSAGE_TEXTAREA: string;
    readonly SEND_MESSAGE_BUTTON: string;
    readonly PROFILE_PHOTO: "img.global-nav__me-photo";
};
