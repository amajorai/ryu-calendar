// The client layer the ported page calls. It mirrors the desktop clients the
// calendar composed — `lib/api/schedules.ts` (`fetchJobs`), `lib/api/workflows.ts`
// (`fetchWorkflows`), and `lib/automations.ts`
// (`createScheduledAgentWorkflow`) — with the SAME function names + (target-first)
// signatures + return types, but every call goes over the `window.ryu` bridge
// instead of a direct `fetch`. The `target` argument is IGNORED (the host holds the
// node token; the sandboxed frame never sees it), kept only so the copied
// component call-sites need no edits. Return shapes match the desktop clients
// verbatim because the host closures reuse those very clients.

import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { RyuBridge } from "./ryu.d.ts";
import type { ScheduledJob, WorkflowSummary } from "./types";

/** A node target the shell passes around. In the sandbox it is inert (the host
 *  owns the token); kept so the ported call-sites type-check unchanged. */
export interface ApiTarget {
	token: string | null;
	url: string;
}

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The calendar capability is not available for this app (grant calendar:crud)."
		);
	}
	return b;
}

/** List all scheduled jobs on the active node (`GET /heartbeat/jobs`). */
export function fetchJobs(_t?: ApiTarget): Promise<ScheduledJob[]> {
	return ryu().calendar.jobs() as Promise<ScheduledJob[]>;
}

/** List workflow definitions (`GET /workflows`) — the calendar reads id+name. */
export function fetchWorkflows(_t?: ApiTarget): Promise<WorkflowSummary[]> {
	return ryu().calendar.workflows() as Promise<WorkflowSummary[]>;
}

/** Read Ryu's shared runtime catalog for the universal agent/provider picker. */
export function fetchRuntimeCatalog(): Promise<RyuCatalogSnapshot> {
	return ryu().catalog.snapshot();
}

/** Create (or update) the durable agent routine that runs on a schedule. The
 *  host owns the node token; Core's validation message propagates on failure. */
export function createScheduledAgentWorkflow(
	_t: ApiTarget | undefined,
	args: {
		agentId: string;
		agentName: string;
		conversationId?: string | null;
		schedule:
			| { kind: "cron"; expr: string }
			| { kind: "every"; interval: string };
		requireApproval?: boolean;
	}
): Promise<void> {
	return ryu().calendar.createAutomation(args);
}
