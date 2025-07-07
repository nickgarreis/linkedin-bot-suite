import { Request, Response, NextFunction } from 'express';
import { validateJobData, validateBulkJobData } from '@linkedin-bot-suite/shared';

export const validateJobPayload = (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = validateJobData(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    return res.status(400).json({ 
      error: 'Invalid job data', 
      details: error instanceof Error ? error.message : 'Validation failed' 
    });
  }
};

export const validateBulkJobPayload = (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = validateBulkJobData(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    return res.status(400).json({ 
      error: 'Invalid bulk job data', 
      details: error instanceof Error ? error.message : 'Validation failed' 
    });
  }
};

export const validateWebhookPayload = (req: Request, res: Response, next: NextFunction) => {
  const { jobId, status, result } = req.body;
  
  if (!jobId || !status || !result) {
    return res.status(400).json({ 
      error: 'Missing required webhook fields: jobId, status, result' 
    });
  }
  
  if (!['completed', 'failed', 'retry'].includes(status)) {
    return res.status(400).json({ 
      error: 'Invalid status. Must be: completed, failed, or retry' 
    });
  }
  
  next();
};