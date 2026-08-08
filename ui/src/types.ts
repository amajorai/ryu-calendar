// The calendar model — ported verbatim from the desktop client
// `apps/desktop/src/lib/api/schedules.ts` (the camelCase shapes `fetchJobs` maps
// Core's snake_case wire into), which the host bridge reuses: its `calendarJobs`
// closure calls `fetchJobs` and forwards the result unchanged over the bridge, so
// the app reads exactly what the desktop page read. The minimal `WorkflowSummary`
// and `AgentSummary` mirror the id+name subset the calendar consumes from the
// host's `fetchWorkflows` / `fetchAgents` clients.

/** How a job is scheduled: a cron expression or a fixed interval. */
export type Schedule =
	| { kind: "cron"; expr: string }
	| { kind: "every"; interval: string };

/** What a job runs when it fires: a workflow or a one-shot agent prompt. */
export type JobTarget =
	| { type: "workflow"; workflowId: string; input?: Record<string, string> }
	| { type: "agent"; agentId: string; prompt: string };

/** Outcome of a single recorded job execution. */
export type ExecOutcome = "success" | "failure";

/** One recorded execution of a job (newest last in {@link ScheduledJob.history}). */
export interface ExecRecord {
	error: string | null;
	finishedAt: string;
	outcome: ExecOutcome;
	runId: string | null;
	startedAt: string;
}

/** A persisted scheduled job as returned by Core (camelCase, post-`fetchJobs`). */
export interface ScheduledJob {
	createdAt: string;
	enabled: boolean;
	history: ExecRecord[];
	id: string;
	lastOutcome: ExecOutcome | null;
	lastRunAt: string | null;
	name: string;
	requireApproval: boolean;
	schedule: Schedule;
	/**
	 * True for Core's internal maintenance jobs (identity-vault health sweep,
	 * continual-learning cycle) that are ensured at startup rather than created
	 * by the user. Derived from the wire target type, so surfaces can hide them
	 * by default without losing user-created automations.
	 */
	system: boolean;
	target: JobTarget;
	updatedAt: string;
}

/** The id+name subset of a workflow the calendar consumes (to label workflow-target
 *  jobs with their human name). The host forwards Core's full `fetchWorkflows`
 *  record; the calendar only reads these two fields. */
export interface WorkflowSummary {
	id: string;
	name: string;
}

/** The id+name subset of an agent the New-automation dialog's picker consumes. The
 *  host forwards Core's full `fetchAgents` summary; the dialog only reads these. */
export interface AgentSummary {
	id: string;
	name: string;
}
