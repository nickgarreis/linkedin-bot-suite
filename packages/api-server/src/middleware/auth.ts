import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';
import { ApiKey } from '@linkedin-bot-suite/shared';

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    clientSlug: string;
    permissions: string[];
  };
}

export const authenticateApiKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers[CONFIG.auth.apiKeyHeader] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Hash the API key for lookup
    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { data: apiKeyData, error } = await supabase
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
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyData.id);

    req.user = {
      id: apiKeyData.id,
      clientSlug: apiKeyData.client_slug,
      permissions: apiKeyData.permissions,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'JWT token required' });
  }

  try {
    const decoded = jwt.verify(token, CONFIG.auth.jwtSecret) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid JWT token' });
  }
};

export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};