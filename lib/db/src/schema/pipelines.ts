import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const columnProfileSchema = z.object({
  name: z.string(),
  dtype: z.string(),
  missing: z.number().int(),
  unique: z.number().int(),
});

export const sourceProfileSchema = z.object({
  fileName: z.string(),
  rowCount: z.number().int(),
  columns: z.array(columnProfileSchema),
  duplicateCount: z.number().int(),
  missingCellCount: z.number().int(),
  previewRows: z.array(z.record(z.string(), z.string())),
});

export const planStepSchema = z.object({
  action: z.string(),
  risk: z.enum(["safe", "approval_required"]),
  reason: z.string(),
});

export const approvalSchema = z.object({
  approver: z.string(),
  role: z.string(),
  decision: z.enum(["approve", "reject"]),
  note: z.string(),
  decidedAt: z.string(),
});

export const validationSchema = z.object({
  passed: z.boolean(),
  inputRows: z.number().int(),
  outputRows: z.number().int(),
  duplicatesRemoved: z.number().int(),
  completenessScore: z.number(),
  uniquenessScore: z.number(),
  schemaPreserved: z.boolean(),
  summary: z.string(),
});

export const activityEventSchema = z.object({
  id: z.string(),
  pipelineId: z.string().uuid(),
  time: z.string(),
  event: z.string(),
  detail: z.string(),
});

export type SourceProfile = z.infer<typeof sourceProfileSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const pipelinesTable = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  requirement: text("requirement").notNull(),
  status: text("status").notNull().default("awaiting_source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  source: jsonb("source").$type<SourceProfile | null>(),
  plan: jsonb("plan").$type<PlanStep[]>().notNull().default([]),
  approval: jsonb("approval").$type<Approval | null>(),
  validation: jsonb("validation").$type<Validation | null>(),
  audit: jsonb("audit").$type<ActivityEvent[]>().notNull().default([]),
});

export const insertPipelineSchema = createInsertSchema(pipelinesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type Pipeline = typeof pipelinesTable.$inferSelect;