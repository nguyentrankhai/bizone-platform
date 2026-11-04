import { z } from "zod";

export const listAuditLogsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  userId: z.number().int().positive().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.number().int().positive().optional(),
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),
});

export const createAuditLogSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  action: z.string().max(50),
  module: z.string().max(50),
  entityType: z.string().max(100),
  entityId: z.number().int().positive().nullable().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().optional(),
  notes: z.string().optional(),
});

export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
