"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCustomRateLimit = exports.bulkRateLimit = exports.webhookRateLimit = exports.defaultRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const shared_1 = require("@linkedin-bot-suite/shared");
exports.defaultRateLimit = (0, express_rate_limit_1.default)({
    windowMs: shared_1.RATE_LIMITS.DEFAULT.windowMs,
    max: shared_1.RATE_LIMITS.DEFAULT.max,
    message: {
        error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Acknowledge we've configured trust proxy securely for Render.com
    skip: () => false,
});
exports.webhookRateLimit = (0, express_rate_limit_1.default)({
    windowMs: shared_1.RATE_LIMITS.WEBHOOK.windowMs,
    max: shared_1.RATE_LIMITS.WEBHOOK.max,
    message: {
        error: 'Too many webhook requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Acknowledge we've configured trust proxy securely for Render.com
    skip: () => false,
});
exports.bulkRateLimit = (0, express_rate_limit_1.default)({
    windowMs: shared_1.RATE_LIMITS.BULK.windowMs,
    max: shared_1.RATE_LIMITS.BULK.max,
    message: {
        error: 'Too many bulk operations from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Acknowledge we've configured trust proxy securely for Render.com
    skip: () => false,
});
const createCustomRateLimit = (windowMs, max) => {
    return (0, express_rate_limit_1.default)({
        windowMs,
        max,
        message: {
            error: 'Rate limit exceeded, please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
        // Acknowledge we've configured trust proxy securely for Render.com
        skip: () => false,
    });
};
exports.createCustomRateLimit = createCustomRateLimit;
