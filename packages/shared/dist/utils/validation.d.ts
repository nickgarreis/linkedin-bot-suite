import Joi from 'joi';
export declare const inviteJobSchema: Joi.ObjectSchema<any>;
export declare const messageJobSchema: Joi.ObjectSchema<any>;
export declare const profileViewJobSchema: Joi.ObjectSchema<any>;
export declare const linkedInJobSchema: Joi.AlternativesSchema<any>;
export declare const bulkJobSchema: Joi.ObjectSchema<any>;
export declare const validateJobData: (data: any) => any;
export declare const validateBulkJobData: (data: any) => any;
