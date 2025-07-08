"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const node_cron_1 = __importDefault(require("node-cron"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("./config");
const rateLimiting_1 = require("./middleware/rateLimiting");
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const health_1 = __importDefault(require("./routes/health"));
const internal_1 = __importDefault(require("./routes/internal"));
// Validate configuration
(0, config_1.validateConfig)();
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(config_1.CONFIG.cors));
// Request parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Logging
app.use((0, morgan_1.default)('combined'));
// Rate limiting
app.use(rateLimiting_1.defaultRateLimit);
// Routes
app.use('/health', health_1.default);
app.use('/webhook', webhooks_1.default);
app.use('/jobs', jobs_1.default);
app.use('/internal', internal_1.default);
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
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: config_1.CONFIG.server.env === 'development' ? err.message : 'Internal server error',
        ...(config_1.CONFIG.server.env === 'development' && { stack: err.stack }),
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
    });
});
const server = app.listen(config_1.CONFIG.server.port, config_1.CONFIG.server.host, () => {
    console.log(`Server running on ${config_1.CONFIG.server.host}:${config_1.CONFIG.server.port}`);
    console.log(`Environment: ${config_1.CONFIG.server.env}`);
});
// Cookie validation function for health monitoring
async function validateCookiesHealth() {
    try {
        const cookies = process.env.LINKEDIN_COOKIES_JSON || '[]';
        const parsedCookies = JSON.parse(cookies);
        const liAt = parsedCookies.find((c) => c.name === 'li_at')?.value;
        if (!liAt)
            return false;
        // Using the imported fetch function
        const resp = await (0, node_fetch_1.default)('https://www.linkedin.com/feed', {
            headers: { cookie: `li_at=${liAt}` },
            redirect: 'manual'
        });
        return resp.status === 200;
    }
    catch {
        return false;
    }
}
// Nightly cookie health check - runs at 03:00 every day
node_cron_1.default.schedule('0 3 * * *', async () => {
    console.log('🔍 Running nightly LinkedIn cookie health check...');
    try {
        const isHealthy = await validateCookiesHealth();
        if (!isHealthy) {
            console.error('⚠️  LinkedIn cookies invalid during nightly check – please refresh cookies');
            // Optional: send webhook notification or email alert here
        }
        else {
            console.log('✅ LinkedIn cookies healthy during nightly check');
        }
    }
    catch (error) {
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
exports.default = app;
