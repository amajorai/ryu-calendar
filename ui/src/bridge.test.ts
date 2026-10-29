import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	type ApiTarget,
	createScheduledAgentWorkflow,
	fetchJobs,
	fetchRuntimeCatalog,
	fetchWorkflows,
} from "./bridge.ts";

import type { RyuBridge, RyuCalendar } from "./ryu.d.ts";
import type { ScheduledJob, WorkflowSummary } from "./types.ts";

type AutomationInput = Parameters<RyuCalendar["createAutomation"]>[0];
interface RecordedCall {
	args: AutomationInput | undefined;
	method: string;
}
interface CalendarFixtureValues {
	"calendar.createAutomation"?: Error;
	"calendar.jobs"?: ScheduledJob[];
	"calendar.workflows"?: WorkflowSummary[];
	"catalog.snapshot"?: RyuCatalogSnapshot;
}
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const catalogFixture: RyuCatalogSnapshot = {
	version: 1,
	agents: [],
	apiTypes: [],
	current: { provider: "", providerRouting: {}, routing: "" },
	hookEvents: [],
	hooks: [],
	plugins: [],
	providers: [],
	thinkingLevels: [],
};

const TARGET: ApiTarget = {
	token: "must-not-cross-the-companion-boundary",
	url: "https://node.invalid",
};

function installBridge(values: CalendarFixtureValues = {}) {
	const calls: RecordedCall[] = [];
	const record = (method: string, args?: AutomationInput) => {
		calls.push({ args, method });
	};
	const bridge: RyuBridge = {
		context: null,
		calendar: {
			createAutomation: (args) => {
				record("calendar.createAutomation", args);
				return values["calendar.createAutomation"]
					? Promise.reject(values["calendar.createAutomation"])
					: Promise.resolve();
			},
			jobs: () => {
				record("calendar.jobs");
				return Promise.resolve(values["calendar.jobs"] ?? []);
			},
			workflows: () => {
				record("calendar.workflows");
				return Promise.resolve(values["calendar.workflows"] ?? []);
			},
		},
		catalog: {
			snapshot: () => {
				record("catalog.snapshot");
				return Promise.resolve(values["catalog.snapshot"] ?? catalogFixture);
			},
			models: ({ providerId }) =>
				Promise.resolve({ providerId, models: [], source: "fixture" }),
		},
	};
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: { ryu: bridge },
	});
	return calls;
}
beforeEach(() => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: undefined,
	});
});
afterEach(() => {
	if (windowDescriptor) {
		Object.defineProperty(globalThis, "window", windowDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}
});

describe("Calendar production bridge", () => {
	it("refuses every operation when the host has not granted calendar:crud", () => {
		expect(() => fetchJobs(TARGET)).toThrow(/grant calendar:crud/);
		expect(() => fetchWorkflows(TARGET)).toThrow(/grant calendar:crud/);
		expect(() => fetchRuntimeCatalog()).toThrow(/grant calendar:crud/);
		expect(() =>
			createScheduledAgentWorkflow(TARGET, {
				agentId: "agent-1",
				agentName: "Agent one",
				schedule: { kind: "every", interval: "30m" },
			})
		).toThrow(/grant calendar:crud/);
	});

	it("reads jobs, workflow names, and the shared catalog without exposing its target", async () => {
		const jobs: ScheduledJob[] = [
			{
				id: "job-1",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
				enabled: true,
				history: [],
				lastOutcome: null,
				lastRunAt: null,
				name: "Daily review",
				requireApproval: false,
				schedule: { kind: "every", interval: "1h" },
				system: false,
				target: { type: "agent", agentId: "agent-1", prompt: "Review" },
			},
		];
		const workflows = [{ id: "workflow-1", name: "Daily review" }];
		const catalog = catalogFixture;
		const calls = installBridge({
			"calendar.jobs": jobs,
			"calendar.workflows": workflows,
			"catalog.snapshot": catalog,
		});

		expect(await fetchJobs(TARGET)).toBe(jobs);
		expect(await fetchWorkflows(TARGET)).toBe(workflows);
		expect(await fetchRuntimeCatalog()).toBe(catalog);
		expect(calls).toEqual([
			{ args: undefined, method: "calendar.jobs" },
			{ args: undefined, method: "calendar.workflows" },
			{ args: undefined, method: "catalog.snapshot" },
		]);
	});

	it("forwards the complete reviewed automation and preserves host refusal for exact retry", async () => {
		const refusal = new Error("approval was refused");
		const calls = installBridge({ "calendar.createAutomation": refusal });
		const automation: AutomationInput = {
			agentId: "agent-1",
			agentName: "Agent one",
			conversationId: "conversation-7",
			schedule: { kind: "cron", expr: "15 9 * * 1" },
			requireApproval: true,
		};

		await expect(createScheduledAgentWorkflow(TARGET, automation)).rejects.toBe(
			refusal
		);
		expect(calls).toEqual([
			{ args: automation, method: "calendar.createAutomation" },
		]);
	});
});
