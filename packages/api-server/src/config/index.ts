import { config } from 'dotenv';

config();

export const CONFIG = {
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
    url: process.env.REDIS_URL!,
  },
  bullmq: {
    queueName: process.env.QUEUE_NAME || 'linkedin-jobs',
    prefix: process.env.BULLMQ_PREFIX || 'bull',
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE!,
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['*'],
    credentials: true,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

export const validateConfig = () => {
  const required = [
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
  ];

  // Check required environment variables
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Validate JWT_SECRET in production
  if (CONFIG.server.env === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
      throw new Error('JWT_SECRET must be set to a secure value in production');
    }
  }

  // Validate LINKEDIN_COOKIES_JSON format if present
  if (process.env.LINKEDIN_COOKIES_JSON) {
    try {
      const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON);
      if (!Array.isArray(cookies)) {
        throw new Error('LINKEDIN_COOKIES_JSON must be a valid JSON array');
      }
    } catch (error) {
      throw new Error('LINKEDIN_COOKIES_JSON contains invalid JSON format');
    }
  }

  // Validate Redis URL format
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('redis://')) {
    console.warn('⚠️  REDIS_URL should start with redis:// for proper connection');
  }

  console.log('✅ Configuration validation passed');
};