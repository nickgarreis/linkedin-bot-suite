"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = exports.authenticateJWT = exports.authenticateApiKey = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
let supabase = null;
function getSupabaseClient() {
    if (!supabase) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
            throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in Render dashboard.');
        }
        supabase = (0, supabase_js_1.createClient)(config_1.CONFIG.supabase.url, config_1.CONFIG.supabase.serviceRoleKey);
    }
    return supabase;
}
const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers[config_1.CONFIG.auth.apiKeyHeader];
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }
        // Hash the API key for lookup
        const crypto = require('crypto');
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const { data: apiKeyData, error } = await getSupabaseClient()
            .from('api_keys')
            .select('*')
            .eq('key_hash', keyHash)
            .eq('is_active', true)
            .single();
        if (error || !apiKeyData) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        // Check if key is expired
        if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'API key expired' });
        }
        // Update last used timestamp
        await getSupabaseClient()
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', apiKeyData.id);
        req.user = {
            id: apiKeyData.id,
            clientSlug: apiKeyData.client_slug,
            permissions: apiKeyData.permissions,
        };
        next();
    }
    catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};
exports.authenticateApiKey = authenticateApiKey;
const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'JWT token required' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.CONFIG.auth.jwtSecret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid JWT token' });
    }
};
exports.authenticateJWT = authenticateJWT;
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.requirePermission = requirePermission;
