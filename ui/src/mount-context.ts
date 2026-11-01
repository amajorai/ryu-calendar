// The host context this companion was mounted with (`window.ryu.context`). The
// standalone `/calendar` route mounts it without one; the agent profile panel
// mounts it through the manifest's `contributes.agent_profile_tabs` entry with
// `{ surface: "agent-profile", agentId, agentName }`, so the calendar scopes
// itself to that one agent's routines.

import { z } from "zod";
import type { ScheduledJob } from "./types.ts";

const agentProfileContextSchema = z.object({
	agentId: z.string().min(1),
	agentName: z.string().optional(),
	surface: z.literal("agent-profile"),
});

export interface AgentScope {
	agentId: string;
	agentName?: string;
}

/** The agent this mount is scoped to, or `null` for the full node calendar. */
export function agentScopeFromContext(context: unknown): AgentScope | null {
	const parsed = agentProfileContextSchema.safeParse(context);
	if (!parsed.success) {
		return null;
	}
	return { agentId: parsed.data.agentId, agentName: parsed.data.agentName };
}

/** Only the jobs that run the scoped agent; every job when unscoped. */
export function jobsForScope(
	jobs: ScheduledJob[],
	scope: AgentScope | null
): ScheduledJob[] {
	if (!scope) {
		return jobs;
	}
	return jobs.filter(
		(job) => job.target.type === "agent" && job.target.agentId === scope.agentId
	);
}
