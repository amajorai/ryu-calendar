// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app needs only the `calendar` surface (grant
// `calendar:crud` + `core:list_agents`); Core owns the `/heartbeat/jobs` + `/workflows` + `/api/agents`
// orchestration behind it.
//
// The bridge validates these concrete readbacks before the calendar renders them.
// Core validation failures from automation creation propagate as thrown messages.

import type {
	RyuCatalogModels,
	RyuCatalogSnapshot,
} from "@ryu/app-host/app-bridge";

import type { ScheduledJob, WorkflowSummary } from "./types.ts";

export interface RyuCalendar {
	/** Create (or update) the durable agent routine that runs on a schedule. The
	 *  desktop dialog and Calendar use the same host-side implementation. Rejects
	 *  with Core's validation message. */
	createAutomation(args: {
		agentId: string;
		agentName: string;
		conversationId?: string | null;
		schedule:
			| { kind: "cron"; expr: string }
			| { kind: "every"; interval: string };
		requireApproval?: boolean;
	}): Promise<void>;
	/** GET /heartbeat/jobs — every scheduled job on this node (camelCase). */
	jobs(): Promise<ScheduledJob[]>;
	/** GET /workflows — workflow definitions (the calendar reads id+name to label
	 *  workflow-target jobs). */
	workflows(): Promise<WorkflowSummary[]>;
}

export interface RyuBridge {
	calendar: RyuCalendar;
	catalog: {
		models(input: { providerId: string }): Promise<RyuCatalogModels>;
		snapshot(): Promise<RyuCatalogSnapshot>;
	};
	/** Host mount context. The agent profile tab mounts with
	 *  `{ surface: "agent-profile", agentId, agentName }`. */
	context: {
		agentId?: string;
		agentName?: string;
		docId?: string;
		spaceId?: string;
		surface?: string;
	} | null;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
