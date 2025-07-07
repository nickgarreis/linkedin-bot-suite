"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBulkJobData = exports.validateJobData = exports.bulkJobSchema = exports.linkedInJobSchema = exports.profileViewJobSchema = exports.messageJobSchema = exports.inviteJobSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.inviteJobSchema = joi_1.default.object({
    type: joi_1.default.string().valid('invite').required(),
    profileUrl: joi_1.default.string().uri().required(),
    note: joi_1.default.string().max(300).optional(),
    accountId: joi_1.default.string().uuid().optional(),
    workflowId: joi_1.default.string().optional(),
    n8nWebhookUrl: joi_1.default.string().uri().optional(),
    priority: joi_1.default.number().min(1).max(10).optional(),
    delay: joi_1.default.number().min(0).optional(),
});
exports.messageJobSchema = joi_1.default.object({
    type: joi_1.default.string().valid('message').required(),
    profileUrl: joi_1.default.string().uri().required(),
    message: joi_1.default.string().min(1).max(8000).required(),
    accountId: joi_1.default.string().uuid().optional(),
    workflowId: joi_1.default.string().optional(),
    n8nWebhookUrl: joi_1.default.string().uri().optional(),
    priority: joi_1.default.number().min(1).max(10).optional(),
    delay: joi_1.default.number().min(0).optional(),
});
exports.profileViewJobSchema = joi_1.default.object({
    type: joi_1.default.string().valid('profile_view').required(),
    profileUrl: joi_1.default.string().uri().required(),
    accountId: joi_1.default.string().uuid().optional(),
    workflowId: joi_1.default.string().optional(),
    n8nWebhookUrl: joi_1.default.string().uri().optional(),
    priority: joi_1.default.number().min(1).max(10).optional(),
    delay: joi_1.default.number().min(0).optional(),
});
exports.linkedInJobSchema = joi_1.default.alternatives().try(exports.inviteJobSchema, exports.messageJobSchema, exports.profileViewJobSchema);
exports.bulkJobSchema = joi_1.default.object({
    jobs: joi_1.default.array().items(exports.linkedInJobSchema).min(1).max(100).required(),
    workflowId: joi_1.default.string().optional(),
    n8nWebhookUrl: joi_1.default.string().uri().optional(),
});
const validateJobData = (data) => {
    const { error, value } = exports.linkedInJobSchema.validate(data);
    if (error) {
        throw new Error(`Validation error: ${error.details[0].message}`);
    }
    return value;
};
exports.validateJobData = validateJobData;
const validateBulkJobData = (data) => {
    const { error, value } = exports.bulkJobSchema.validate(data);
    if (error) {
        throw new Error(`Validation error: ${error.details[0].message}`);
    }
    return value;
};
exports.validateBulkJobData = validateBulkJobData;
