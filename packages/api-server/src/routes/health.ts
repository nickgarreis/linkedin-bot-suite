import { Router } from 'express';
import { Queue } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

const router = Router();
const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);

// Basic health check
router.get('/', async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'linkedin-bot-api',
    version: '1.0.0',
  });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'linkedin-bot-api',
    version: '1.0.0',
    checks: {
      redis: 'unknown',
      supabase: 'unknown',
      queue: 'unknown',
    },
  };

  try {
    // Check Redis connection
    const queue = new Queue('health-check', {
      connection: { url: CONFIG.redis.url },
    });
    
    await queue.add('health-check', { test: true });
    await queue.close();
    health.checks.redis = 'healthy';
    health.checks.queue = 'healthy';
  } catch (error) {
    health.checks.redis = 'unhealthy';
    health.checks.queue = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Check Supabase connection
    const { data, error } = await supabase
      .from('linkedin_accounts')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    health.checks.supabase = 'healthy';
  } catch (error) {
    health.checks.supabase = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Ready check (for container orchestration)
router.get('/ready', async (req, res) => {
  try {
    // Quick check of essential services
    const queue = new Queue('ready-check', {
      connection: { url: CONFIG.redis.url },
    });
    
    await queue.add('ready-check', { test: true });
    await queue.close();
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Service not ready',
    });
  }
});

export default router;