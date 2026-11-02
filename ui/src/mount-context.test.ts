import { describe, expect, it } from "bun:test";
import { agentScopeFromContext, jobsForScope } from "./mount-context.ts";
import type { ScheduledJob } from "./types.ts";

function job(id: string, target: ScheduledJob["target"]): ScheduledJob {
	return {
		createdAt: "2026-01-01T00:00:00Z",
		enabled: true,
		history: [],
		id,
		lastOutcome: null,
		lastRunAt: null,
		name: id,
		requireApproval: false,
		schedule: { kind: "cron", expr: "0 9 * * *", tz: null },
		system: false,
		target,
		updatedAt: "2026-01-01T00:00:00Z",
	};
}

const jobs = [
	job("muse-daily", { type: "agent", agentId: "agent-muse", prompt: "Plan" }),
	job("other-daily", { type: "agent", agentId: "agent-other", prompt: "Go" }),
	job("workflow", { type: "workflow", workflowId: "wf-1" }),
];

describe("agentScopeFromContext", () => {
	it("scopes an agent-profile mount to its agent", () => {
		expect(
			agentScopeFromContext({
				agentId: "agent-muse",
				agentName: "Muse",
				surface: "agent-profile",
			})
		).toEqual({ agentId: "agent-muse", agentName: "Muse" });
	});

	it("leaves the standalone and other surfaces unscoped", () => {
		expect(agentScopeFromContext(null)).toBeNull();
		expect(agentScopeFromContext(undefined)).toBeNull();
		expect(
			agentScopeFromContext({ agentId: "agent-muse", surface: "settings" })
		).toBeNull();
		expect(
			agentScopeFromContext({ agentId: "", surface: "agent-profile" })
		).toBeNull();
	});
});

describe("jobsForScope", () => {
	it("keeps only the scoped agent's jobs", () => {
		const scoped = jobsForScope(jobs, { agentId: "agent-muse" });
		expect(scoped.map((entry) => entry.id)).toEqual(["muse-daily"]);
	});

	it("returns every job when unscoped", () => {
		expect(jobsForScope(jobs, null)).toHaveLength(3);
	});
});
