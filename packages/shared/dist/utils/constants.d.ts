export declare const JOB_TYPES: {
    readonly INVITE: "invite";
    readonly MESSAGE: "message";
    readonly PROFILE_VIEW: "profile_view";
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
    readonly CONNECT_BUTTON: "button[aria-label*=\"Connect\"], button[aria-label*=\"Vernetzen\"], button[data-control-name=\"connect\"]";
    readonly NOTE_BUTTON: "button[aria-label*=\"Add a note\"], button[aria-label*=\"Notiz\"], button[data-control-name=\"add-note\"]";
    readonly SEND_BUTTON: "button[aria-label*=\"Send invite\"], button[aria-label*=\"Einladung senden\"], button[data-control-name=\"send.invite\"]";
    readonly MESSAGE_BUTTON: "button[aria-label*=\"Message\"], button[aria-label*=\"Nachricht\"], button[data-control-name=\"message\"]";
    readonly MESSAGE_TEXTAREA: "div[contenteditable=\"true\"][data-placeholder*=\"message\" i]";
    readonly SEND_MESSAGE_BUTTON: "button[aria-label*=\"Send\"], button[aria-label*=\"Senden\"], button[data-control-name=\"send\"]";
    readonly PROFILE_PHOTO: "img.global-nav__me-photo";
};
