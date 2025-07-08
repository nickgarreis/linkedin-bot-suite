"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINKEDIN_SELECTORS = exports.DEFAULT_JOB_OPTIONS = exports.RATE_LIMITS = exports.API_PERMISSIONS = exports.WORKFLOW_STATUS = exports.JOB_STATUS = exports.JOB_TYPES = void 0;
exports.JOB_TYPES = {
    INVITE: 'invite',
    MESSAGE: 'message',
    PROFILE_VIEW: 'profile_view',
    API_RESEARCH: 'api_research',
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
    // Comprehensive Connect Button selectors with enhanced 2025 patterns
    CONNECT_BUTTON: [
        // Primary patterns (2025) - English and German with exact matches
        'button[aria-label="Connect"], button[aria-label="Vernetzen"], button[aria-label="Verbinden"]',
        'button[aria-label*="Connect"], button[aria-label*="Vernetzen"], button[aria-label*="Verbinden"]',
        'button[data-control-name="connect"]',
        'button[data-test-id*="connect"]',
        // Modern 2025 LinkedIn button patterns
        'button[data-view-name*="connect"]',
        '[data-urn*="profile"] button[aria-label*="Connect"]',
        '[data-urn*="profile"] button[aria-label*="Vernetzen"]',
        'button.artdeco-button--primary[aria-label*="Connect"]',
        'button.artdeco-button--primary[aria-label*="Vernetzen"]',
        'button.artdeco-button--secondary[aria-label*="Connect"]',
        'button.artdeco-button--secondary[aria-label*="Vernetzen"]',
        // Profile action buttons area - both languages (2025)
        '.pv-s-profile-actions button[aria-label*="Connect"], .pv-s-profile-actions button[aria-label*="Vernetzen"]',
        '.pvs-profile-actions button[aria-label*="Connect"], .pvs-profile-actions button[aria-label*="Vernetzen"]',
        '.profile-actions button[aria-label*="Connect"], .profile-actions button[aria-label*="Vernetzen"]',
        '[data-view-name="profile-actions"] button[aria-label*="Connect"]',
        '[data-view-name="profile-actions"] button[aria-label*="Vernetzen"]',
        '.pv-top-card__member-action-bar button[aria-label*="Connect"]',
        '.pv-top-card__member-action-bar button[aria-label*="Vernetzen"]',
        // Enhanced text-based detection (case insensitive)
        'button[aria-label*="connect" i], button[aria-label*="vernetzen" i]',
        'button:contains("Connect"), button:contains("Vernetzen"), button:contains("Verbinden")',
        // Span and text content search within buttons
        'button span:contains("Connect"), button span:contains("Vernetzen")',
        'button span[aria-hidden]:contains("Connect"), button span[aria-hidden]:contains("Vernetzen")',
        // More specific button group patterns
        '.artdeco-button-group button[aria-label*="Connect"]',
        '.artdeco-button-group button[aria-label*="Vernetzen"]',
        // Action button containers with modern patterns
        '[role="main"] button[aria-label*="Connect"]',
        '[role="main"] button[aria-label*="Vernetzen"]',
        'section[aria-label*="profile" i] button[aria-label*="Connect"]',
        'section[aria-label*="profile" i] button[aria-label*="Vernetzen"]',
        // Fallback patterns for edge cases
        'button[type="button"][aria-label*="Connect"]',
        'button[type="button"][aria-label*="Vernetzen"]',
        'button[title*="Connect"], button[title*="Vernetzen"]'
    ].join(', '),
    // Enhanced Note Button selectors with comprehensive German support
    NOTE_BUTTON: [
        'button[aria-label*="Add a note"], button[aria-label*="Notiz"], button[aria-label*="Nachricht hinzufügen"]',
        'button[data-control-name="add-note"]',
        'button[data-test-id*="note"]',
        '.send-invite__add-note-button',
        'button:has-text("Add a note"), button:has-text("Notiz"), button:has-text("Nachricht hinzufügen")',
        'button:contains("Add a note"), button:contains("Notiz")'
    ].join(', '),
    // Enhanced Send Button selectors with comprehensive German support
    SEND_BUTTON: [
        'button[aria-label*="Send invite"], button[aria-label*="Einladung senden"], button[aria-label*="Senden"]',
        'button[data-control-name="send.invite"], button[data-control-name="send"]',
        'button[data-test-id*="send"]',
        '.send-invite__actions button[aria-label*="Send"], .send-invite__actions button[aria-label*="Senden"]',
        'button:has-text("Send invite"), button:has-text("Einladung"), button:has-text("Senden")',
        'button:contains("Send"), button:contains("Senden"), button:contains("Einladung")'
    ].join(', '),
    // Enhanced Message Button selectors with comprehensive German support
    MESSAGE_BUTTON: [
        'button[aria-label*="Message"], button[aria-label*="Nachricht"], button[aria-label*="Nachricht senden"]',
        'button[data-control-name="message"]',
        'button[data-test-id*="message"]',
        '.pv-s-profile-actions button[aria-label*="Message"], .pv-s-profile-actions button[aria-label*="Nachricht"]',
        '.pvs-profile-actions button[aria-label*="Message"], .pvs-profile-actions button[aria-label*="Nachricht"]',
        'button:has-text("Message"), button:has-text("Nachricht")',
        'button:contains("Message"), button:contains("Nachricht")'
    ].join(', '),
    // Enhanced Message Textarea selectors
    MESSAGE_TEXTAREA: [
        'div[contenteditable="true"][data-placeholder*="message" i]',
        '.msg-form__contenteditable',
        '.msg-form__msg-content-container div[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'textarea[placeholder*="message" i]'
    ].join(', '),
    // Enhanced Send Message Button selectors
    SEND_MESSAGE_BUTTON: [
        'button[aria-label*="Send"], button[aria-label*="Senden"]',
        'button[data-control-name="send"]',
        'button[data-test-id*="send"]',
        '.msg-form__send-button',
        'button:has-text("Send"), button:has-text("Senden")'
    ].join(', '),
    PROFILE_PHOTO: 'img.global-nav__me-photo',
};
