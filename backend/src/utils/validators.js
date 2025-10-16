import Joi from "joi";

// Common fields
export const idParamSchema = Joi.object({
  id: Joi.string().trim().required()
});

export const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).default(100),
  cursor: Joi.string().optional()
});

export const createLearnerSchema = Joi.object({
  admNo: Joi.string().trim().required(),
  name: Joi.object({
    surname: Joi.string().trim().required(),
    forename: Joi.string().trim().required(),
    other: Joi.string().allow("").optional()
  }).required(),
  classId: Joi.string().trim().required(),
  yearGroup: Joi.string().trim().allow(""),
  guardian: Joi.object({
    name: Joi.string().trim().allow(""),
    phone: Joi.string().trim().allow("")
  }).optional(),
  meta: Joi.object().optional()
});

export const updateLearnerSchema = createLearnerSchema.fork(
  Object.keys(createLearnerSchema.describe().keys),
  (s) => s.optional()
);

export const createTeacherSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().allow(""),
  phone: Joi.string().trim().allow("")
});

export const saveAssignmentsSchema = Joi.object({
  teacherId: Joi.string().trim().required(),
  assignments: Joi.array().items(Joi.object({
    classId: Joi.string().trim().required(),
    subjectId: Joi.string().trim().required()
  })).default([])
});

export const marksBatchSchema = Joi.object({
  year: Joi.number().integer().required(),
  term: Joi.number().integer().min(1).max(3).required(),
  classId: Joi.string().trim().required(),
  subjectId: Joi.string().trim().required(),
  entries: Joi.array().items(Joi.object({
    learnerId: Joi.string().trim().required(),
    score: Joi.number().min(0).allow(null),
    outOf: Joi.number().min(1).default(100),
    comment: Joi.string().allow("")
  })).default([])
});

export const createClassSchema = Joi.object({
  name: Joi.string().trim().required(),
  capacity: Joi.number().integer().min(1).default(40)
});

export const renameClassSchema = Joi.object({
  name: Joi.string().trim().required()
});

export const setClassCapacitySchema = Joi.object({
  capacity: Joi.number().integer().min(1).required()
});

export const simpleNameSchema = Joi.object({
  name: Joi.string().trim().required()
});

export const createVoteheadSchema = Joi.object({
  name: Joi.string().trim().required(),
  code: Joi.string().trim().required(),
  defaultAmount: Joi.number().min(0).required()
});

export const assignClassFeesSchema = Joi.object({
  classId: Joi.string().trim().required(),
  year: Joi.number().integer().required(),
  term: Joi.number().integer().min(1).max(3).required(),
  lines: Joi.array().items(Joi.object({
    voteheadId: Joi.string().trim().required(),
    amount: Joi.number().min(0).required()
  })).min(1).required()
});

export const recordPaymentSchema = Joi.object({
  learnerId: Joi.string().trim().required(),
  amount: Joi.number().min(1).required(),
  method: Joi.string().valid("cash","mpesa","card").required(),
  reference: Joi.string().allow(""),
  note: Joi.string().allow(""),
  idempotencyKey: Joi.string().trim().required()
});

export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  displayName: Joi.string().trim().required(),
  role: Joi.string().valid("admin","teacher","staff","user").default("user")
});

export const changePasswordSchema = Joi.object({
  password: Joi.string().min(6).required()
});

export const changeRoleSchema = Joi.object({
  role: Joi.string().valid("admin","teacher","staff","user").required()
});
