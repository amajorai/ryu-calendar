import { z } from "zod";
import type { ScheduledJob, WorkflowSummary } from "./types.ts";

const extra = z.json().optional();
const scheduleSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("cron"),
			expr: z.string(),
			tz: z.string().nullable().optional(),
		})
		.catchall(extra),
	z.object({ kind: z.literal("every"), interval: z.string() }).catchall(extra),
]);
const targetSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("workflow"),
			workflowId: z.string(),
			input: z.record(z.string(), z.string()).optional(),
		})
		.catchall(extra),
	z
		.object({
			type: z.literal("agent"),
			agentId: z.string(),
			prompt: z.string(),
			conversationId: z.string().nullable().optional(),
		})
		.catchall(extra),
]);
const outcomeSchema = z.enum(["success", "failure"]);
export const scheduledJobSchema = z
	.object({
		createdAt: z.string(),
		enabled: z.boolean(),
		history: z.array(
			z
				.object({
					error: z.string().nullable(),
					finishedAt: z.string(),
					outcome: outcomeSchema,
					runId: z.string().nullable(),
					startedAt: z.string(),
				})
				.catchall(extra)
		),
		id: z.string(),
		lastOutcome: outcomeSchema.nullable(),
		lastRunAt: z.string().nullable(),
		name: z.string(),
		requireApproval: z.boolean(),
		schedule: scheduleSchema,
		system: z.boolean(),
		target: targetSchema,
		updatedAt: z.string(),
	})
	.catchall(extra) satisfies z.ZodType<ScheduledJob>;
export const scheduledJobsSchema = z.array(scheduledJobSchema);
export const workflowSummarySchema = z
	.object({ id: z.string(), name: z.string() })
	.catchall(extra) satisfies z.ZodType<WorkflowSummary>;
export const workflowSummariesSchema = z.array(workflowSummarySchema);
