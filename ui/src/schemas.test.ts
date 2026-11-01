import { describe, expect, it } from "bun:test";
import {
	scheduledJobSchema,
	scheduledJobsSchema,
	workflowSummariesSchema,
} from "./schemas.ts";
import type { ScheduledJob } from "./types.ts";

const job: ScheduledJob = {
	createdAt: "2026-01-01T00:00:00Z",
	enabled: true,
	history: [
		{
			error: null,
			finishedAt: "2026-01-01T00:00:10Z",
			outcome: "success",
			runId: null,
			startedAt: "2026-01-01T00:00:00Z",
		},
	],
	id: "job-1",
	lastOutcome: null,
	lastRunAt: null,
	name: "Morning report",
	requireApproval: false,
	schedule: { kind: "cron", expr: "0 9 * * *", tz: null },
	system: false,
	target: {
		type: "agent",
		agentId: "agent-1",
		conversationId: null,
		prompt: "Summarize the morning",
	},
	updatedAt: "2026-01-01T00:00:00Z",
};

describe("calendar bridge readback contracts", () => {
	it("retains nullable Core fields and additive metadata on jobs, targets and schedules", () => {
		const value = {
			...job,
			metadata: { source: "Core" },
			schedule: { ...job.schedule, schedulerVersion: 2 },
			target: { ...job.target, metadata: { owner: "team" } },
		};
		const parsed: ScheduledJob[] = scheduledJobsSchema.parse([value]);
		expect(parsed).toEqual([value]);
	});
	it("accepts workflow targets and fixed intervals without inventing optional fields", () => {
		const value: ScheduledJob = {
			...job,
			schedule: { kind: "every", interval: "5m" },
			target: {
				type: "workflow",
				workflowId: "workflow-1",
				input: { topic: "review" },
			},
		};
		const parsed: ScheduledJob = scheduledJobSchema.parse(value);
		expect(parsed).toEqual(value);
	});
	it("rejects malformed scheduled jobs before projection", () => {
		expect(() =>
			scheduledJobsSchema.parse([{ ...job, enabled: "true" }])
		).toThrow();
		expect(() =>
			scheduledJobsSchema.parse([
				{ ...job, target: { type: "agent", agentId: "agent-1" } },
			])
		).toThrow();
	});
	it("requires workflow labels while retaining additional workflow content", () => {
		const value = {
			id: "workflow-1",
			name: "Morning report",
			nodes: [{ id: "future-node", type: "future-kind" }],
		};
		expect(workflowSummariesSchema.parse([value])).toEqual([value]);
		expect(() =>
			workflowSummariesSchema.parse([{ id: "workflow-1" }])
		).toThrow();
	});
});
