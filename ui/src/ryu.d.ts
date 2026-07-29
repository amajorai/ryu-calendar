// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app needs only the `calendar` surface (grant
// `calendar:crud`); Core owns the `/heartbeat/jobs` + `/workflows` + `/api/agents`
// orchestration behind it.
//
// Method return shapes mirror the desktop clients the host reuses verbatim (the host
// closures call `fetchJobs`/`fetchWorkflows`/`fetchAgents`/`createScheduledAgentWorkflow`
// and forward the result), so `bridge.ts` re-declares the concrete types and casts
// these `unknown`s. `createAutomation` runs the same idempotent composite the desktop
// dialog ran (create-or-update the scheduled workflow + drain legacy agent jobs)
// host-side, so Core's validation error propagates as the thrown message.

export interface RyuCalendar {
	/** GET /api/agents — the agent list for the New-automation picker (id+name). */
	agents(): Promise<unknown>;
	/** Create (or update) the scheduled workflow that runs an agent on a schedule,
	 *  then drain any legacy agent-target job — the exact composite the desktop
	 *  dialog ran, executed host-side. Rejects with Core's validation message. */
	createAutomation(args: {
		agentId: string;
		agentName: string;
		schedule:
			| { kind: "cron"; expr: string }
			| { kind: "every"; interval: string };
		requireApproval?: boolean;
	}): Promise<void>;
	/** GET /heartbeat/jobs — every scheduled job on this node (camelCase). */
	jobs(): Promise<unknown>;
	/** GET /workflows — workflow definitions (the calendar reads id+name to label
	 *  workflow-target jobs). */
	workflows(): Promise<unknown>;
}

export interface RyuBridge {
	calendar: RyuCalendar;
	context: { spaceId?: string; docId?: string } | null;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
