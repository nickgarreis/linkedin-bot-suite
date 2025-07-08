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
    url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE || 'placeholder_key',
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
  const criticalRequired = [
    'REDIS_URL',
  ];
  
  const optionalRequired = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
  ];

  // Check critical environment variables (deployment blockers)
  for (const key of criticalRequired) {
    if (!process.env[key]) {
      throw new Error(`Missing critical environment variable: ${key}`);
    }
  }
  
  // Check optional environment variables (warnings only for deployment)
  for (const key of optionalRequired) {
    if (!process.env[key]) {
      console.warn(`⚠️  WARNING: Missing environment variable: ${key}`);
      console.warn(`   Some features may not work until this is configured in Render dashboard`);
    } else {
      console.log(`✅ ${key} configured`);
    }
  }

  // Validate JWT_SECRET in production (warning for initial deployment)
  if (CONFIG.server.env === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
      console.warn('⚠️  WARNING: JWT_SECRET should be set to a secure value in production');
      console.warn('   Current value is using default - please configure in Render dashboard');
    } else {
      console.log('✅ JWT_SECRET properly configured for production');
    }
  }

  // Validate LINKEDIN_COOKIES_JSON format if present
  if (process.env.LINKEDIN_COOKIES_JSON) {
    try {
      const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON);
      if (!Array.isArray(cookies)) {
        console.warn('⚠️  WARNING: LINKEDIN_COOKIES_JSON should be a valid JSON array');
      } else {
        console.log('✅ LINKEDIN_COOKIES_JSON format validated');
      }
    } catch (error) {
      console.warn('⚠️  WARNING: LINKEDIN_COOKIES_JSON contains invalid JSON format');
      console.warn('   LinkedIn automation features may not work properly');
    }
  } else {
    console.log('ℹ️  LINKEDIN_COOKIES_JSON not set - LinkedIn automation disabled');
  }

  // Validate Redis URL format
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('redis://')) {
    console.warn('⚠️  REDIS_URL should start with redis:// for proper connection');
  }

  console.log('✅ Configuration validation passed');
};