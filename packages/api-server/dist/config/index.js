"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = exports.CONFIG = void 0;
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
exports.CONFIG = {
    server: {
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || '0.0.0.0',
        env: process.env.NODE_ENV || 'development',
    },
    auth: {
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
        apiKeyHeader: process.env.API_KEY_HEADER || 'x-api-key',
    },
    redis: {
        url: process.env.REDIS_URL,
    },
    bullmq: {
        queueName: process.env.QUEUE_NAME || 'linkedin-jobs',
        prefix: process.env.BULLMQ_PREFIX || 'bull',
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE,
    },
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['*'],
        credentials: true,
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};
const validateConfig = () => {
    const required = [
        'REDIS_URL',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE',
    ];
    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
};
exports.validateConfig = validateConfig;
