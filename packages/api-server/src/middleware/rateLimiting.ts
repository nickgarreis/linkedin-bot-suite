import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '@linkedin-bot-suite/shared';

export const defaultRateLimit = rateLimit({
  windowMs: RATE_LIMITS.DEFAULT.windowMs,
  max: RATE_LIMITS.DEFAULT.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookRateLimit = rateLimit({
  windowMs: RATE_LIMITS.WEBHOOK.windowMs,
  max: RATE_LIMITS.WEBHOOK.max,
  message: {
    error: 'Too many webhook requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bulkRateLimit = rateLimit({
  windowMs: RATE_LIMITS.BULK.windowMs,
  max: RATE_LIMITS.BULK.max,
  message: {
    error: 'Too many bulk operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const createCustomRateLimit = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Rate limit exceeded, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};