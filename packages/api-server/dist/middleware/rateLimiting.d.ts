export declare const defaultRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const webhookRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const bulkRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const createCustomRateLimit: (windowMs: number, max: number) => import("express-rate-limit").RateLimitRequestHandler;
