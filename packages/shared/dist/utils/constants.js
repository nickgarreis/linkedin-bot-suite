"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINKEDIN_SELECTORS = exports.DEFAULT_JOB_OPTIONS = exports.RATE_LIMITS = exports.API_PERMISSIONS = exports.WORKFLOW_STATUS = exports.JOB_STATUS = exports.JOB_TYPES = void 0;
exports.JOB_TYPES = {
    INVITE: 'invite',
    MESSAGE: 'message',
    PROFILE_VIEW: 'profile_view',
};
exports.JOB_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRY: 'retry',
};
exports.WORKFLOW_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
};
exports.API_PERMISSIONS = {
    JOBS_CREATE: 'jobs:create',
    JOBS_READ: 'jobs:read',
    JOBS_DELETE: 'jobs:delete',
    WEBHOOKS_RECEIVE: 'webhooks:receive',
    ACCOUNTS_READ: 'accounts:read',
    ACCOUNTS_MANAGE: 'accounts:manage',
};
exports.RATE_LIMITS = {
    DEFAULT: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
    },
    WEBHOOK: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 60, // limit each IP to 60 requests per minute
    },
    BULK: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // limit each IP to 10 bulk operations per hour
    },
};
exports.DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
};
exports.LINKEDIN_SELECTORS = {
    CONNECT_BUTTON: 'button[aria-label*="Connect"], button[aria-label*="Vernetzen"], button[data-control-name="connect"]',
    NOTE_BUTTON: 'button[aria-label*="Add a note"], button[aria-label*="Notiz"], button[data-control-name="add-note"]',
    SEND_BUTTON: 'button[aria-label*="Send invite"], button[aria-label*="Einladung senden"], button[data-control-name="send.invite"]',
    MESSAGE_BUTTON: 'button[aria-label*="Message"], button[aria-label*="Nachricht"], button[data-control-name="message"]',
    MESSAGE_TEXTAREA: 'div[contenteditable="true"][data-placeholder*="message" i]',
    SEND_MESSAGE_BUTTON: 'button[aria-label*="Send"], button[aria-label*="Senden"], button[data-control-name="send"]',
    PROFILE_PHOTO: 'img.global-nav__me-photo',
};
