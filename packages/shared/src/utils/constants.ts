export const JOB_TYPES = {
  INVITE: 'invite',
  MESSAGE: 'message',
  PROFILE_VIEW: 'profile_view',
} as const;

export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry',
} as const;

export const WORKFLOW_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const API_PERMISSIONS = {
  JOBS_CREATE: 'jobs:create',
  JOBS_READ: 'jobs:read',
  JOBS_DELETE: 'jobs:delete',
  WEBHOOKS_RECEIVE: 'webhooks:receive',
  ACCOUNTS_READ: 'accounts:read',
  ACCOUNTS_MANAGE: 'accounts:manage',
} as const;

export const RATE_LIMITS = {
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
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
} as const;

export const LINKEDIN_SELECTORS = {
  // Enhanced Connect Button selectors with multiple fallbacks
  CONNECT_BUTTON: [
    // Primary patterns (2024-2025)
    'button[aria-label*="Connect"], button[aria-label*="Vernetzen"]',
    'button[data-control-name="connect"]',
    'button[data-test-id*="connect"]',
    // Profile action buttons area
    '.pv-s-profile-actions button[aria-label*="Connect"]',
    '.pvs-profile-actions button[aria-label*="Connect"]',
    // Text-based fallbacks  
    'button:has-text("Connect"), button:has-text("Vernetzen")',
    // Class-based patterns
    'button.artdeco-button--primary[aria-label*="Connect"]',
    'button.connect-button',
    // XPath fallback
    '//button[contains(@aria-label, "Connect") or contains(text(), "Connect")]'
  ].join(', '),
  
  // Enhanced Note Button selectors
  NOTE_BUTTON: [
    'button[aria-label*="Add a note"], button[aria-label*="Notiz"]',
    'button[data-control-name="add-note"]',
    'button[data-test-id*="note"]',
    '.send-invite__add-note-button',
    'button:has-text("Add a note"), button:has-text("Notiz")'
  ].join(', '),
  
  // Enhanced Send Button selectors
  SEND_BUTTON: [
    'button[aria-label*="Send invite"], button[aria-label*="Einladung senden"]',
    'button[data-control-name="send.invite"]',
    'button[data-test-id*="send"]',
    '.send-invite__actions button[aria-label*="Send"]',
    'button:has-text("Send invite"), button:has-text("Einladung")'
  ].join(', '),
  
  // Enhanced Message Button selectors
  MESSAGE_BUTTON: [
    'button[aria-label*="Message"], button[aria-label*="Nachricht"]',
    'button[data-control-name="message"]',
    'button[data-test-id*="message"]',
    '.pv-s-profile-actions button[aria-label*="Message"]',
    '.pvs-profile-actions button[aria-label*="Message"]',
    'button:has-text("Message"), button:has-text("Nachricht")'
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
} as const;