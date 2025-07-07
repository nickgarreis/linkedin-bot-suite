import Joi from 'joi';

export const inviteJobSchema = Joi.object({
  type: Joi.string().valid('invite').required(),
  profileUrl: Joi.string().uri().required(),
  note: Joi.string().max(300).optional(),
  accountId: Joi.string().uuid().optional(),
  workflowId: Joi.string().optional(),
  n8nWebhookUrl: Joi.string().uri().optional(),
  priority: Joi.number().min(1).max(10).optional(),
  delay: Joi.number().min(0).optional(),
});

export const messageJobSchema = Joi.object({
  type: Joi.string().valid('message').required(),
  profileUrl: Joi.string().uri().required(),
  message: Joi.string().min(1).max(8000).required(),
  accountId: Joi.string().uuid().optional(),
  workflowId: Joi.string().optional(),
  n8nWebhookUrl: Joi.string().uri().optional(),
  priority: Joi.number().min(1).max(10).optional(),
  delay: Joi.number().min(0).optional(),
});

export const profileViewJobSchema = Joi.object({
  type: Joi.string().valid('profile_view').required(),
  profileUrl: Joi.string().uri().required(),
  accountId: Joi.string().uuid().optional(),
  workflowId: Joi.string().optional(),
  n8nWebhookUrl: Joi.string().uri().optional(),
  priority: Joi.number().min(1).max(10).optional(),
  delay: Joi.number().min(0).optional(),
});

export const linkedInJobSchema = Joi.alternatives().try(
  inviteJobSchema,
  messageJobSchema,
  profileViewJobSchema
);

export const bulkJobSchema = Joi.object({
  jobs: Joi.array().items(linkedInJobSchema).min(1).max(100).required(),
  workflowId: Joi.string().optional(),
  n8nWebhookUrl: Joi.string().uri().optional(),
});

export const validateJobData = (data: any) => {
  const { error, value } = linkedInJobSchema.validate(data);
  if (error) {
    throw new Error(`Validation error: ${error.details[0].message}`);
  }
  return value;
};

export const validateBulkJobData = (data: any) => {
  const { error, value } = bulkJobSchema.validate(data);
  if (error) {
    throw new Error(`Validation error: ${error.details[0].message}`);
  }
  return value;
};