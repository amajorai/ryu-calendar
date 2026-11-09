import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { RyuBridge } from "../src/ryu.d.ts";
import type { ScheduledJob, WorkflowSummary } from "../src/types.ts";

type Creation = Parameters<RyuBridge["calendar"]["createAutomation"]>[0];
interface FixtureState {
	jobs: ScheduledJob[];
	workflows: WorkflowSummary[];
}
interface FixtureCall {
	input?: Creation;
	method: string;
	result?: string;
}
interface CalendarFixture {
	allowJobs(): void;
	failNextJobsRead(): void;
	failReadbackWorkflowsAfterAck(): void;
	holdCreate(): void;
	holdReads(): void;
	refuseCreate(): void;
	releaseCreate(): void;
	releaseReads(): void;
	snapshot(): { state: FixtureState; calls: FixtureCall[] };
}
declare global {
	interface Window {
		__calendarFixture?: CalendarFixture;
	}
}

const originalJob: ScheduledJob = {
	id: "existing-job",
	name: "Existing node routine",
	enabled: true,
	createdAt: "2026-10-01T08:00:00Z",
	updatedAt: "2026-10-01T08:00:00Z",
	history: [],
	lastOutcome: null,
	lastRunAt: null,
	system: false,
	requireApproval: false,
	schedule: { kind: "cron", expr: "0 10 * * *" },
	target: { type: "workflow", workflowId: "existing-workflow" },
};
const seed: FixtureState = {
	jobs: [originalJob],
	workflows: [{ id: "existing-workflow", name: "Existing workflow" }],
};
const expectedCreate: Creation = {
	agentId: "review-agent",
	agentName: "Review agent",
	schedule: { kind: "cron", expr: "30 09 * * 2" },
	requireApproval: true,
};
const expectedDailyCreate: Creation = {
	agentId: "review-agent",
	agentName: "Review agent",
	schedule: { kind: "cron", expr: "00 09 * * *" },
	requireApproval: false,
};

// Finite node-owned bridge fixture, retained across browser reload. It executes
// the shipped entry/App/dialog/bridge; no OS scheduler or composite-host claim.
function installFixture(input: {
	seed: FixtureState;
	failJobs: boolean;
	acceptedCreations: Creation[];
}) {
	const key = "ryu-calendar-creation-fixture-v1";
	const clone = <T>(value: T): T => structuredClone(value);
	let state: FixtureState = JSON.parse(
		sessionStorage.getItem(key) ?? JSON.stringify(input.seed)
	);
	const calls: FixtureCall[] = [];
	let refuseCreate = false;
	let failJobs =
		input.failJobs && !sessionStorage.getItem("calendar-jobs-ready");
	let failNextJobsRead = false;
	let failReadbackWorkflowsAfterAck = false;
	let workflowReadsBeforeReadbackFailure = 0;
	let holdCreate = false;
	let releaseCreate: (() => void) | null = null;
	let holdReads = false;
	const releases: Array<() => void> = [];
	const read = async (method: string) => {
		calls.push({ method });
		if (method === "calendar.jobs" && failJobs) {
			throw new Error("Fixture jobs unavailable");
		}
		if (method === "calendar.jobs" && failNextJobsRead) {
			failNextJobsRead = false;
			throw new Error("Fixture jobs unavailable after acknowledged creation");
		}
		if (
			method === "calendar.workflows" &&
			workflowReadsBeforeReadbackFailure > 0
		) {
			workflowReadsBeforeReadbackFailure -= 1;
			if (workflowReadsBeforeReadbackFailure === 0) {
				throw new Error(
					"Fixture workflow names unavailable after acknowledged creation"
				);
			}
		}
		if (holdReads) {
			await new Promise<void>((resolve) => releases.push(resolve));
		}
		return;
	};
	const bridge: RyuBridge = {
		context: null,
		calendar: {
			jobs: async () => {
				await read("calendar.jobs");
				return clone(state.jobs);
			},
			workflows: async () => {
				await read("calendar.workflows");
				return clone(state.workflows);
			},
			createAutomation: async (args) => {
				const call: FixtureCall = {
					method: "calendar.createAutomation",
					input: clone(args),
				};
				calls.push(call);
				if (refuseCreate) {
					refuseCreate = false;
					call.result = "refused";
					throw new Error("Fixture refused reviewed automation");
				}
				if (holdCreate) {
					holdCreate = false;
					await new Promise<void>((resolve) => {
						releaseCreate = resolve;
					});
				}
				const exactAcceptedPayload = input.acceptedCreations.some(
					(expected) =>
						args.agentId === expected.agentId &&
						args.agentName === expected.agentName &&
						JSON.stringify(args.schedule) ===
							JSON.stringify(expected.schedule) &&
						args.requireApproval === expected.requireApproval &&
						Object.keys(args).length === 4 &&
						Object.keys(args).every((field) =>
							["agentId", "agentName", "schedule", "requireApproval"].includes(
								field
							)
						)
				);
				if (!exactAcceptedPayload) {
					throw new Error("Unexpected Calendar creation contract");
				}
				if (args.requireApproval === undefined) {
					throw new Error("Calendar creation omitted approval state");
				}
				const existingRoutine = state.jobs.find(
					(job) =>
						job.name.endsWith(" (scheduled)") &&
						job.target.type === "agent" &&
						job.target.agentId === args.agentId
				);
				const routine: ScheduledJob = {
					...(existingRoutine ?? clone(input.seed.jobs[0]!)),
					id: existingRoutine?.id ?? `job_fixture_${args.agentId}`,
					name: `${args.agentName} (scheduled)`,
					enabled: true,
					requireApproval: args.requireApproval,
					schedule: clone(args.schedule),
					target: {
						type: "agent",
						agentId: args.agentId,
						prompt: "Run",
						conversationId: null,
					},
				};
				state = {
					jobs: existingRoutine
						? state.jobs.map((job) =>
								job.id === existingRoutine.id ? routine : job
							)
						: [...state.jobs, routine],
					workflows: state.workflows,
				};
				sessionStorage.setItem(key, JSON.stringify(state));
				call.result = "acknowledged";
				if (failReadbackWorkflowsAfterAck) {
					failReadbackWorkflowsAfterAck = false;
					// This finite bridge fixture does not run the Desktop host composite.
					// Fail Calendar's first authoritative workflow-name read after ack.
					workflowReadsBeforeReadbackFailure = 1;
				}
			},
		},
		catalog: {
			snapshot: async () => {
				calls.push({ method: "catalog.snapshot" });
				return {
					agents: [
						{
							id: "existing-agent",
							name: "Existing agent",
							enabled: true,
							installed: true,
						},
						{
							id: "review-agent",
							name: "Review agent",
							enabled: true,
							installed: true,
							model: "fixture-model",
							engine: "local",
						},
					],
					providers: [
						{
							id: "local",
							label: "Local fixture",
							api: "openai",
							authKind: "none",
							configured: true,
						},
					],
					current: {
						model: "fixture-model",
						provider: "local",
						providerRouting: {},
						routing: "auto",
					},
					apiTypes: [],
					hooks: [],
					hookEvents: [],
					plugins: [],
					thinkingLevels: [],
					version: 1,
				};
			},
			models: async () => {
				calls.push({ method: "catalog.models" });
				throw new Error("Unexpected Calendar model discovery");
			},
		},
	};
	// The shared Companion i18n layer probes this optional host field. The
	// Calendar fixture intentionally does not grant or implement it, but the
	// absent optional capability must not be confused with an unknown RPC.
	const proxyTarget = Object.assign(bridge, { i18n: undefined });
	window.ryu = new Proxy(proxyTarget, {
		get(target, property) {
			if (property === "shell") {
				return undefined;
			}
			if (property === "calendar") {
				return target.calendar;
			}
			if (property === "catalog") {
				return target.catalog;
			}
			if (property === "context") {
				return target.context;
			}
			if (property === "i18n") {
				return target.i18n;
			}
			calls.push({ method: `unexpected:${String(property)}` });
			throw new Error(`Unexpected Calendar bridge method: ${String(property)}`);
		},
	});
	window.__calendarFixture = {
		snapshot: () => ({ state: clone(state), calls: clone(calls) }),
		allowJobs: () => {
			failJobs = false;
			sessionStorage.setItem("calendar-jobs-ready", "1");
		},
		failNextJobsRead: () => {
			failNextJobsRead = true;
		},
		failReadbackWorkflowsAfterAck: () => {
			failReadbackWorkflowsAfterAck = true;
		},
		refuseCreate: () => {
			refuseCreate = true;
		},
		holdCreate: () => {
			holdCreate = true;
		},
		releaseCreate: () => {
			if (!releaseCreate) {
				throw new Error("No held creation");
			}
			releaseCreate();
			releaseCreate = null;
		},
		holdReads: () => {
			holdReads = true;
		},
		releaseReads: () => {
			holdReads = false;
			for (const resolve of releases.splice(0)) {
				resolve();
			}
		},
	};
}

async function snapshot(page: Page) {
	const result = await page.evaluate(() =>
		window.__calendarFixture?.snapshot()
	);
	if (!result) {
		throw new Error("Missing Calendar fixture");
	}
	return result;
}
async function capture(page: Page, name: string) {
	const directory = path.resolve(
		process.env.RYU_APPS_STORE_PROOF_DIR ??
			path.join(import.meta.dirname, "evidence")
	);
	mkdirSync(directory, { recursive: true });
	await page.screenshot({ path: path.join(directory, name), fullPage: true });
}
async function mount(page: Page, failJobs = false) {
	await page.clock.setFixedTime(new Date("2026-10-05T08:00:00Z"));
	await page.addInitScript(installFixture, {
		seed,
		failJobs,
		acceptedCreations: [expectedCreate, expectedDailyCreate],
	});
	await page.goto("/");
}

test("Calendar creation retains reviewed fields on refusal, waits for ack and authoritative refetch, then survives reload", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await mount(page);
	await expect(
		page.getByRole("button", { name: "New automation", exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing node routine", { exact: true }).first()
	).toBeVisible();
	await page
		.getByRole("button", { name: "New automation", exact: true })
		.click();
	const dialog = page.getByRole("dialog", {
		name: "New automation",
		exact: true,
	});
	const agentPicker = dialog.getByRole("combobox", {
		name: "Choose the agent to schedule",
		exact: true,
	});
	await expect(agentPicker).toContainText("Existing agent");
	await agentPicker.click();
	await page
		.getByRole("option")
		.filter({ has: page.getByText("Review agent", { exact: true }) })
		.click();
	await expect(agentPicker).toContainText("Review agent");
	await dialog.getByLabel("Schedule", { exact: true }).selectOption("weekly");
	await dialog.getByLabel("Day", { exact: true }).selectOption("tuesday");
	await dialog.getByLabel("Time (UTC)", { exact: true }).fill("09:30");
	await dialog
		.getByRole("switch", { name: "Require my approval", exact: true })
		.check();
	await page.evaluate(() => window.__calendarFixture!.refuseCreate());
	await dialog
		.getByRole("button", { name: "Create automation", exact: true })
		.click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Fixture refused reviewed automation"
	);
	await expect(dialog.getByLabel("Schedule", { exact: true })).toHaveValue(
		"weekly"
	);
	await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(
		"tuesday"
	);
	await expect(dialog.getByLabel("Time (UTC)", { exact: true })).toHaveValue(
		"09:30"
	);
	await expect(
		dialog.getByRole("switch", { name: "Require my approval", exact: true })
	).toBeChecked();
	await expect(agentPicker).toContainText("Review agent");
	const refused = await snapshot(page);
	expect(refused.state).toEqual(seed);
	expect(
		refused.calls.filter((call) => call.method === "calendar.createAutomation")
	).toEqual([
		{
			method: "calendar.createAutomation",
			input: expectedCreate,
			result: "refused",
		},
	]);
	await page.evaluate(() => {
		window.__calendarFixture!.holdCreate();
		window.__calendarFixture!.holdReads();
	});
	await dialog
		.getByRole("button", { name: "Create automation", exact: true })
		.click();
	await expect(
		dialog.getByRole("button", { name: "Creating…", exact: true })
	).toBeDisabled();
	await expect(
		dialog.getByRole("button", { name: "Cancel", exact: true })
	).toBeDisabled();
	await expect(dialog.getByLabel("Schedule", { exact: true })).toBeDisabled();
	await expect(dialog.getByLabel("Day", { exact: true })).toBeDisabled();
	await expect(dialog.getByLabel("Time (UTC)", { exact: true })).toBeDisabled();
	await expect(
		dialog.getByRole("switch", { name: "Require my approval", exact: true })
	).toBeDisabled();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeVisible();
	await expect(agentPicker).toBeDisabled();
	const held = await snapshot(page);
	expect(held.state).toEqual(seed);
	expect(
		held.calls.filter((call) => call.method === "calendar.createAutomation")
	).toEqual([
		{
			method: "calendar.createAutomation",
			input: expectedCreate,
			result: "refused",
		},
		{ method: "calendar.createAutomation", input: expectedCreate },
	]);
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true })
	).toHaveCount(0);
	const jobsBefore = held.calls.filter(
		(call) => call.method === "calendar.jobs"
	).length;
	const workflowsBefore = held.calls.filter(
		(call) => call.method === "calendar.workflows"
	).length;
	await page.evaluate(() => window.__calendarFixture!.releaseCreate());
	await expect
		.poll(
			async () =>
				(await snapshot(page)).calls.filter(
					(call) => call.method === "calendar.jobs"
				).length
		)
		.toBeGreaterThan(jobsBefore);
	await expect
		.poll(
			async () =>
				(await snapshot(page)).calls.filter(
					(call) => call.method === "calendar.workflows"
				).length
		)
		.toBeGreaterThan(workflowsBefore);
	await expect(dialog).toBeVisible();
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true })
	).toHaveCount(0);
	await page.evaluate(() => window.__calendarFixture!.releaseReads());
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true }).first()
	).toBeVisible();
	await expect(
		page.getByText("Existing workflow", { exact: true }).first()
	).toBeVisible();
	await expect(
		page
			.getByText("Review agent (scheduled)", { exact: true })
			.last()
			.locator("..")
	).toContainText(/9:30|09:30/);
	const completed = await snapshot(page);
	expect(completed.state.jobs[0]).toEqual(originalJob);
	expect(completed.state.workflows[0]).toEqual(seed.workflows[0]);
	expect(completed.state.jobs[1]).toEqual({
		...originalJob,
		id: "job_fixture_review-agent",
		name: "Review agent (scheduled)",
		requireApproval: true,
		schedule: expectedCreate.schedule,
		target: {
			type: "agent",
			agentId: "review-agent",
			prompt: "Run",
			conversationId: null,
		},
	});
	expect(completed.state.workflows).toEqual(seed.workflows);
	expect(
		completed.calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([
		{
			method: "calendar.createAutomation",
			input: expectedCreate,
			result: "refused",
		},
		{
			method: "calendar.createAutomation",
			input: expectedCreate,
			result: "acknowledged",
		},
	]);
	await page.reload();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing workflow", { exact: true }).first()
	).toBeVisible();
	await expect(
		page.getByText("Existing node routine", { exact: true }).first()
	).toBeVisible();
	expect((await snapshot(page)).state).toEqual(completed.state);
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([]);
	expect(errors).toEqual([]);
	expect(
		completed.calls.filter(
			(call) =>
				![
					"calendar.jobs",
					"calendar.workflows",
					"calendar.createAutomation",
					"catalog.snapshot",
				].includes(call.method)
		)
	).toEqual([]);
	await capture(page, "calendar-agent-routine-authoritative-reload.png");
});

test("Calendar refresh shows pending feedback while the active-node reads are in flight", async ({
	page,
}) => {
	await mount(page);
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing node routine", { exact: true }).first()
	).toBeVisible();
	await page.evaluate(() => window.__calendarFixture!.holdReads());
	const refresh = page.getByRole("button", { name: "Refresh", exact: true });
	await refresh.click();
	await expect(refresh).toBeDisabled();
	await expect(refresh.locator("svg")).toHaveClass(/animate-spin/);
	await page.evaluate(() => window.__calendarFixture!.releaseReads());
	await expect(refresh).toBeEnabled();
	await capture(page, "calendar-refresh-completed-readback.png");
});

test("Calendar closes after creation acknowledgement and recovers the durable routine after readback refusal", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await mount(page);
	await page
		.getByRole("button", { name: "New automation", exact: true })
		.click();
	const dialog = page.getByRole("dialog", {
		name: "New automation",
		exact: true,
	});
	const agentPicker = dialog.getByRole("combobox", {
		name: "Choose the agent to schedule",
		exact: true,
	});
	await agentPicker.click();
	await page
		.getByRole("option")
		.filter({ has: page.getByText("Review agent", { exact: true }) })
		.click();
	await page.evaluate(() => window.__calendarFixture!.failNextJobsRead());
	await dialog
		.getByRole("button", { name: "Create automation", exact: true })
		.click();
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByText("Could not load calendar", { exact: true })
	).toBeVisible();
	const afterAcknowledgement = await snapshot(page);
	expect(afterAcknowledgement.state.jobs).toHaveLength(2);
	expect(afterAcknowledgement.state.jobs[1]).toEqual({
		...originalJob,
		id: "job_fixture_review-agent",
		name: "Review agent (scheduled)",
		requireApproval: false,
		schedule: expectedDailyCreate.schedule,
		target: {
			type: "agent",
			agentId: "review-agent",
			prompt: "Run",
			conversationId: null,
		},
	});
	expect(
		afterAcknowledgement.calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([
		{
			method: "calendar.createAutomation",
			input: expectedDailyCreate,
			result: "acknowledged",
		},
	]);
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true }).first()
	).toBeVisible();
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toHaveLength(1);
	await page.reload();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true }).first()
	).toBeVisible();
	expect((await snapshot(page)).state.jobs).toHaveLength(2);
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([]);
	expect(errors).toEqual([]);
	await capture(page, "calendar-agent-routine-readback-recovery.png");
});

test("Calendar surfaces workflow-name readback refusal after acknowledgement and retries without creating again", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await mount(page);
	await page
		.getByRole("button", { name: "New automation", exact: true })
		.click();
	const dialog = page.getByRole("dialog", {
		name: "New automation",
		exact: true,
	});
	const agentPicker = dialog.getByRole("combobox", {
		name: "Choose the agent to schedule",
		exact: true,
	});
	await agentPicker.click();
	await page
		.getByRole("option")
		.filter({ has: page.getByText("Review agent", { exact: true }) })
		.click();
	await page.evaluate(() =>
		window.__calendarFixture!.failReadbackWorkflowsAfterAck()
	);
	await dialog
		.getByRole("button", { name: "Create automation", exact: true })
		.click();
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByText("Could not load calendar", { exact: true })
	).toBeVisible();
	const afterAcknowledgement = await snapshot(page);
	expect(afterAcknowledgement.state.jobs).toHaveLength(2);
	expect(afterAcknowledgement.state.jobs[1]).toEqual({
		...originalJob,
		id: "job_fixture_review-agent",
		name: "Review agent (scheduled)",
		requireApproval: false,
		schedule: expectedDailyCreate.schedule,
		target: {
			type: "agent",
			agentId: "review-agent",
			prompt: "Run",
			conversationId: null,
		},
	});
	expect(afterAcknowledgement.state.workflows).toEqual(seed.workflows);
	expect(
		afterAcknowledgement.calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([
		{
			method: "calendar.createAutomation",
			input: expectedDailyCreate,
			result: "acknowledged",
		},
	]);
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Review agent (scheduled)", { exact: true }).first()
	).toBeVisible();
	await expect(
		page.getByText("Existing workflow", { exact: true }).first()
	).toBeVisible();
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toHaveLength(1);
	await page.reload();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing workflow", { exact: true }).first()
	).toBeVisible();
	expect((await snapshot(page)).state.jobs).toHaveLength(2);
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([]);
	expect(errors).toEqual([]);
	await capture(page, "calendar-workflow-name-readback-recovery.png");
});

test("Calendar initial jobs refusal retries the actual list without creating or mutating schedules", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await mount(page, true);
	await expect(
		page.getByText("Could not load calendar", { exact: true })
	).toBeVisible();
	expect((await snapshot(page)).state).toEqual(seed);
	await page.evaluate(() => window.__calendarFixture!.allowJobs());
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing node routine", { exact: true }).first()
	).toBeVisible();
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([]);
	expect((await snapshot(page)).state).toEqual(seed);
	await page.reload();
	await page.getByRole("button", { name: "Agenda", exact: true }).click();
	await expect(
		page.getByText("Existing node routine", { exact: true }).first()
	).toBeVisible();
	expect((await snapshot(page)).state).toEqual(seed);
	expect(errors).toEqual([]);
	await capture(page, "calendar-jobs-refusal-retry-readback.png");
});

test("Calendar week events keep their time positions and clickable size", async ({
	page,
}) => {
	await mount(page);
	await page.getByRole("button", { name: "Week", exact: true }).click();
	const event = page.locator(".calendar-event-position").first();
	await expect(event).toBeVisible();
	const placement = await event.evaluate((element) => {
		const style = getComputedStyle(element);
		const button = element.querySelector("button");
		if (!button) {
			throw new Error("Calendar event button is missing");
		}
		return {
			top: style.top,
			left: style.left,
			height: element.getBoundingClientRect().height,
			width: element.getBoundingClientRect().width,
			buttonHeight: button.getBoundingClientRect().height,
			buttonWidth: button.getBoundingClientRect().width,
		};
	});
	expect(placement.top).toBe("480px");
	expect(placement.left).toBe("0px");
	expect(placement.height).toBe(24);
	expect(placement.width).toBeGreaterThan(80);
	expect(placement.buttonHeight).toBe(placement.height);
	expect(placement.buttonWidth).toBe(placement.width);
	await event.getByRole("button").click();
	expect(
		(await snapshot(page)).calls.filter(
			(call) => call.method === "calendar.createAutomation"
		)
	).toEqual([]);
	await capture(page, "calendar-week-event-position.png");
});
