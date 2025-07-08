"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bullmq_1 = require("bullmq");
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const router = (0, express_1.Router)();
let supabase = null;
function getSupabaseClient() {
    if (!supabase) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
            throw new Error('Supabase credentials not configured');
        }
        supabase = (0, supabase_js_1.createClient)(config_1.CONFIG.supabase.url, config_1.CONFIG.supabase.serviceRoleKey);
    }
    return supabase;
}
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
        const queue = new bullmq_1.Queue('health-check', {
            connection: { url: config_1.CONFIG.redis.url },
        });
        await queue.add('health-check', { test: true });
        await queue.close();
        health.checks.redis = 'healthy';
        health.checks.queue = 'healthy';
    }
    catch (error) {
        health.checks.redis = 'unhealthy';
        health.checks.queue = 'unhealthy';
        health.status = 'degraded';
    }
    try {
        // Check Supabase connection (only if configured)
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE &&
            process.env.SUPABASE_URL !== 'https://placeholder.supabase.co') {
            const { data, error } = await getSupabaseClient()
                .from('linkedin_accounts')
                .select('count')
                .limit(1);
            if (error)
                throw error;
            health.checks.supabase = 'healthy';
        }
        else {
            health.checks.supabase = 'not_configured';
        }
    }
    catch (error) {
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
        const queue = new bullmq_1.Queue('ready-check', {
            connection: { url: config_1.CONFIG.redis.url },
        });
        await queue.add('ready-check', { test: true });
        await queue.close();
        res.json({
            status: 'ready',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Service not ready',
        });
    }
});
exports.default = router;
