import { Request, Response, NextFunction } from 'express';
export declare const validateJobPayload: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const validateBulkJobPayload: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const validateWebhookPayload: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
