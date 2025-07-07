import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { CONFIG, validateConfig } from './config';
import { defaultRateLimit } from './middleware/rateLimiting';
import webhooksRouter from './routes/webhooks';
import jobsRouter from './routes/jobs';
import healthRouter from './routes/health';

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