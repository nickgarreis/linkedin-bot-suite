import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import { CONFIG, validateConfig } from './config';
import { defaultRateLimit } from './middleware/rateLimiting';
import webhooksRouter from './routes/webhooks';
import jobsRouter from './routes/jobs';
import healthRouter from './routes/health';
import internalRouter from './routes/internal';

// Validate configuration
validateConfig();

const app: express.Application = express();

// Security middleware
app.use(helmet());
app.use(cors(CONFIG.cors));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Rate limiting
app.use(defaultRateLimit);

// Routes
app.use('/health', healthRouter);
app.use('/webhook', webhooksRouter);
app.use('/jobs', jobsRouter);
app.use('/internal', internalRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'LinkedIn Bot API',
    version: '1.0.0',
    description: 'API server for LinkedIn automation with n8n integration',
    endpoints: {
      health: '/health',
      webhooks: '/webhook',
      jobs: '/jobs',
    },
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: CONFIG.server.env === 'development' ? err.message : 'Internal server error',
    ...(CONFIG.server.env === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

const server = app.listen(CONFIG.server.port, CONFIG.server.host, () => {
  console.log(`Server running on ${CONFIG.server.host}:${CONFIG.server.port}`);
  console.log(`Environment: ${CONFIG.server.env}`);
});

// Cookie validation function for health monitoring
async function validateCookiesHealth(): Promise<boolean> {
  try {
    const cookies = process.env.LINKEDIN_COOKIES_JSON || '[]';
    const parsedCookies = JSON.parse(cookies);
    const liAt = parsedCookies.find((c: any) => c.name === 'li_at')?.value;
    if (!liAt) return false;

    const fetch = (await import('node-fetch')).default;
    const resp = await fetch('https://www.linkedin.com/feed', {
      headers: { cookie: `li_at=${liAt}` },
      redirect: 'manual'
    });
    return resp.status === 200;
  } catch {
    return false;
  }
}

// Nightly cookie health check - runs at 03:00 every day
cron.schedule('0 3 * * *', async () => {
  console.log('🔍 Running nightly LinkedIn cookie health check...');
  try {
    const isHealthy = await validateCookiesHealth();
    if (!isHealthy) {
      console.error('⚠️  LinkedIn cookies invalid during nightly check – please refresh cookies');
      // Optional: send webhook notification or email alert here
    } else {
      console.log('✅ LinkedIn cookies healthy during nightly check');
    }
  } catch (error) {
    console.error('❌ Error during nightly cookie health check:', error);
  }
}, {
  timezone: "UTC"
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;