import { describe, expect, it } from "bun:test";
import type { ExecRecord, ScheduledJob } from "../types.ts";
import {
	buildCalendarEvents,
	buildRunStatusTimelineEntries,
	type CalendarEvent,
	describeSchedule,
	eventDayKey,
	groupEventsByDay,
	groupEventsByJob,
} from "./events.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
	return {
		id: "job1",
		name: "Nightly report",
		enabled: true,
		system: false,
		requireApproval: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		lastRunAt: null,
		lastOutcome: null,
		history: [],
		schedule: { kind: "cron", expr: "0 9 * * *" },
		target: { type: "agent", agentId: "agent1", prompt: "hi" },
		...overrides,
	};
}

function record(overrides: Partial<ExecRecord> = {}): ExecRecord {
	return {
		startedAt: "2026-01-05T09:00:00.000Z",
		finishedAt: "2026-01-05T09:00:10.000Z",
		outcome: "success",
		runId: "run1",
		error: null,
		...overrides,
	};
}

// A UTC month window: Jan 2026.
const WIN_START = new Date("2026-01-01T00:00:00.000Z");
const WIN_END = new Date("2026-02-01T00:00:00.000Z");

// ── describeSchedule ─────────────────────────────────────────────────────────

describe("describeSchedule", () => {
	it("maps known interval strings to phrases", () => {
		expect(describeSchedule({ kind: "every", interval: "5m" })).toBe(
			"Every 5 minutes"
		);
		expect(describeSchedule({ kind: "every", interval: "1h" })).toBe(
			"Every hour"
		);
		expect(describeSchedule({ kind: "every", interval: "3600" })).toBe(
			"Every hour"
		);
	});

	it("falls back to a generic phrase for unknown intervals", () => {
		expect(describeSchedule({ kind: "every", interval: "45m" })).toBe(
			"Every 45m"
		);
	});

	it("recognises daily cron and formats the hour with AM/PM", () => {
		expect(describeSchedule({ kind: "cron", expr: "0 9 * * *" })).toBe(
			"Daily at 9 AM"
		);
		expect(describeSchedule({ kind: "cron", expr: "0 0 * * *" })).toBe(
			"Daily at 12 AM"
		);
		expect(describeSchedule({ kind: "cron", expr: "0 12 * * *" })).toBe(
			"Daily at 12 PM"
		);
		expect(describeSchedule({ kind: "cron", expr: "0 15 * * *" })).toBe(
			"Daily at 3 PM"
		);
	});

	it("recognises weekly cron and names the day, unknown day falls back to number", () => {
		expect(describeSchedule({ kind: "cron", expr: "0 8 * * 1" })).toBe(
			"Weekly on Monday at 8 AM"
		);
		// Day index 7 is out of range → falls back to the raw capture.
		expect(describeSchedule({ kind: "cron", expr: "0 8 * * 7" })).toBe(
			"Weekly on 7 at 8 AM"
		);
	});

	it("returns the raw cron for anything unrecognised", () => {
		expect(describeSchedule({ kind: "cron", expr: "*/15 * * * *" })).toBe(
			"cron: */15 * * * *"
		);
	});
});

// ── buildCalendarEvents: past runs ───────────────────────────────────────────

describe("buildCalendarEvents past runs", () => {
	it("emits a past event for a history record inside the window", () => {
		const events = buildCalendarEvents(
			[job({ enabled: false, history: [record()] })],
			WIN_START,
			WIN_END
		);
		expect(events).toHaveLength(1);
		const [e] = events as [CalendarEvent];
		expect(e.kind).toBe("past");
		expect(e.outcome).toBe("success");
		expect(e.jobId).toBe("job1");
		expect(e.end?.toISOString()).toBe("2026-01-05T09:00:10.000Z");
	});

	it("carries a failure outcome and its error message", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [record({ outcome: "failure", error: "boom" })],
				}),
			],
			WIN_START,
			WIN_END
		);
		expect(events[0]?.outcome).toBe("failure");
		expect(events[0]?.error).toBe("boom");
	});

	it("drops records outside the window and non-finite timestamps", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [
						record({ startedAt: "2025-12-31T23:59:59.000Z" }), // before start
						record({ startedAt: "2026-02-01T00:00:00.000Z" }), // == end (exclusive)
						record({ startedAt: "not-a-date" }), // non-finite
						record({ startedAt: "2026-01-10T09:00:00.000Z" }), // inside
					],
				}),
			],
			WIN_START,
			WIN_END
		);
		expect(events).toHaveLength(1);
		expect(events[0]?.start.toISOString()).toBe("2026-01-10T09:00:00.000Z");
	});
});

describe("buildRunStatusTimelineEntries", () => {
	const dayStart = new Date("2026-01-05T00:00:00.000Z");
	const dayEnd = new Date("2026-01-06T00:00:00.000Z");

	it("maps outcomes to colors and expands aggregate projections across the day", () => {
		const events: CalendarEvent[] = [
			{
				end: new Date("2026-01-05T09:00:10.000Z"),
				id: "success",
				jobId: "job1",
				jobName: "Morning digest",
				kind: "past",
				outcome: "success",
				scheduleLabel: "Daily at 9 AM",
				start: new Date("2026-01-05T09:00:00.000Z"),
			},
			{
				end: new Date("2026-01-05T11:00:08.000Z"),
				id: "failure",
				jobId: "job2",
				jobName: "Health check",
				kind: "past",
				outcome: "failure",
				scheduleLabel: "Every hour",
				start: new Date("2026-01-05T11:00:00.000Z"),
			},
			{
				aggregateCount: 288,
				id: "aggregate",
				jobId: "job3",
				jobName: "Mention watch",
				kind: "upcoming",
				scheduleLabel: "Every 5 minutes",
				start: new Date("2026-01-05T12:00:00.000Z"),
			},
		];

		const entries = buildRunStatusTimelineEntries(dayStart, dayEnd, events);

		expect(entries.map((entry) => entry.status)).toEqual([
			"success",
			"failure",
			"scheduled",
		]);
		expect(entries[0]?.endAt).toBe(
			new Date("2026-01-05T09:00:10.000Z").getTime()
		);
		expect(entries[2]?.startAt).toBe(dayStart.getTime());
		expect(entries[2]?.endAt).toBe(dayEnd.getTime());
		expect(entries[2]?.label).toContain("288 projected runs; times collapsed");
	});

	it("returns no entries for an invalid day window", () => {
		expect(
			buildRunStatusTimelineEntries(new Date("not-a-date"), dayEnd, [])
		).toEqual([]);
	});
});

// ── buildCalendarEvents: disabled jobs ───────────────────────────────────────

describe("buildCalendarEvents disabled jobs", () => {
	it("skips upcoming projection for a disabled job but keeps its past runs", () => {
		const events = buildCalendarEvents(
			[job({ enabled: false, history: [record()] })],
			WIN_START,
			WIN_END
		);
		// Only the one past run — no projected daily fires.
		expect(events).toHaveLength(1);
		expect(events.every((e) => e.kind === "past")).toBe(true);
	});
});

// ── buildCalendarEvents: cron projection ─────────────────────────────────────

describe("buildCalendarEvents cron projection", () => {
	it("projects one upcoming fire per day for a daily cron", () => {
		const events = buildCalendarEvents(
			[job({ schedule: { kind: "cron", expr: "0 9 * * *" } })],
			WIN_START,
			WIN_END
		);
		const upcoming = events.filter((e) => e.kind === "upcoming");
		// 31 days in January → 31 fires (each at 09:00 UTC), none aggregated.
		expect(upcoming).toHaveLength(31);
		expect(upcoming.every((e) => e.aggregateCount === undefined)).toBe(true);
	});

	it("collapses a high-frequency cron into a per-day aggregate marker", () => {
		const events = buildCalendarEvents(
			[job({ schedule: { kind: "cron", expr: "*/5 * * * *" } })],
			WIN_START,
			WIN_END
		);
		const upcoming = events.filter((e) => e.kind === "upcoming");
		// Every day collapses (288 fires/day > 6) → aggregate markers only.
		expect(upcoming.length).toBeGreaterThan(0);
		expect(upcoming.every((e) => (e.aggregateCount ?? 0) > 6)).toBe(true);
	});

	it("returns no upcoming events for an unparseable cron expression", () => {
		const events = buildCalendarEvents(
			[job({ schedule: { kind: "cron", expr: "not a cron" } })],
			WIN_START,
			WIN_END
		);
		expect(events.filter((e) => e.kind === "upcoming")).toHaveLength(0);
	});

	it("projects cron expressions in the job's IANA time zone", () => {
		const events = buildCalendarEvents(
			[
				job({
					schedule: {
						kind: "cron",
						expr: "0 9 * * *",
						tz: "America/New_York",
					},
				}),
			],
			WIN_START,
			new Date("2026-01-02T00:00:00.000Z")
		);
		const first = events.find((event) => event.kind === "upcoming");
		expect(first?.start.toISOString()).toBe("2026-01-01T14:00:00.000Z");
	});
});

// ── buildCalendarEvents: interval projection ─────────────────────────────────

describe("buildCalendarEvents interval projection", () => {
	it("projects discrete fires for an hourly interval anchored to createdAt", () => {
		const start = new Date("2026-01-01T00:00:00.000Z");
		const end = new Date("2026-01-01T05:00:00.000Z");
		const events = buildCalendarEvents(
			[
				job({
					schedule: { kind: "every", interval: "1h" },
					createdAt: "2026-01-01T00:00:00.000Z",
				}),
			],
			start,
			end
		);
		const upcoming = events.filter((e) => e.kind === "upcoming");
		// Fires at 00,01,02,03,04 (< end at 05) → 5 discrete events, none aggregated.
		expect(upcoming).toHaveLength(5);
		expect(upcoming.every((e) => e.aggregateCount === undefined)).toBe(true);
	});

	it("aggregates a sub-hourly interval into one per-day marker with a count", () => {
		const start = new Date("2026-01-01T00:00:00.000Z");
		const end = new Date("2026-01-02T00:00:00.000Z");
		const events = buildCalendarEvents(
			[
				job({
					schedule: { kind: "every", interval: "5m" },
					createdAt: "2026-01-01T00:00:00.000Z",
				}),
			],
			start,
			end
		);
		const upcoming = events.filter((e) => e.kind === "upcoming");
		expect(upcoming).toHaveLength(1);
		// 24h / 5m = 288 fires in the day.
		expect(upcoming[0]?.aggregateCount).toBe(288);
	});

	it("skips interval projection when the interval is unparseable", () => {
		const events = buildCalendarEvents(
			[job({ schedule: { kind: "every", interval: "garbage" } })],
			WIN_START,
			WIN_END
		);
		expect(events.filter((e) => e.kind === "upcoming")).toHaveLength(0);
	});
});

// ── target resolution ────────────────────────────────────────────────────────

describe("buildCalendarEvents target resolution", () => {
	it("marks system jobs and omits agent/workflow ids", () => {
		const events = buildCalendarEvents(
			[job({ system: true, enabled: false, history: [record()] })],
			WIN_START,
			WIN_END
		);
		expect(events[0]?.system).toBe(true);
		expect(events[0]?.agentId).toBeUndefined();
		expect(events[0]?.workflowId).toBeUndefined();
	});

	it("resolves a workflow target name from the supplied map", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [record()],
					target: { type: "workflow", workflowId: "wf_1" },
				}),
			],
			WIN_START,
			WIN_END,
			new Map([["wf_1", "My Workflow"]])
		);
		expect(events[0]?.workflowId).toBe("wf_1");
		expect(events[0]?.workflowName).toBe("My Workflow");
	});

	it("leaves workflowName undefined when no map entry exists", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [record()],
					target: { type: "workflow", workflowId: "wf_x" },
				}),
			],
			WIN_START,
			WIN_END
		);
		expect(events[0]?.workflowId).toBe("wf_x");
		expect(events[0]?.workflowName).toBeUndefined();
	});

	it("carries the agent id for agent-target jobs", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [record()],
					target: { type: "agent", agentId: "agent-42", prompt: "run" },
				}),
			],
			WIN_START,
			WIN_END
		);
		expect(events[0]?.agentId).toBe("agent-42");
	});
});

// ── sorting + grouping ───────────────────────────────────────────────────────

describe("buildCalendarEvents ordering and grouping", () => {
	it("sorts the combined events ascending by start instant", () => {
		const events = buildCalendarEvents(
			[
				job({
					enabled: false,
					history: [
						record({ startedAt: "2026-01-20T09:00:00.000Z" }),
						record({ startedAt: "2026-01-05T09:00:00.000Z" }),
						record({ startedAt: "2026-01-12T09:00:00.000Z" }),
					],
				}),
			],
			WIN_START,
			WIN_END
		);
		const times = events.map((e) => e.start.getTime());
		const sorted = [...times].sort((a, b) => a - b);
		expect(times).toEqual(sorted);
	});

	it("groups events by local calendar day and keys them consistently", () => {
		const d1 = new Date("2026-01-05T09:00:00.000Z");
		const d2 = new Date("2026-01-05T18:00:00.000Z");
		const events: CalendarEvent[] = [
			{
				id: "a",
				jobId: "j",
				jobName: "n",
				start: d1,
				kind: "upcoming",
				scheduleLabel: "l",
			},
			{
				id: "b",
				jobId: "j",
				jobName: "n",
				start: d2,
				kind: "upcoming",
				scheduleLabel: "l",
			},
		];
		const grouped = groupEventsByDay(events);
		expect(grouped.size).toBe(1);
		expect(grouped.get(eventDayKey(d1))).toHaveLength(2);
	});

	it("groups a status-page window by job without changing event order", () => {
		const events: CalendarEvent[] = [
			{
				id: "a",
				jobId: "job-a",
				jobName: "A",
				start: new Date("2026-01-05T09:00:00.000Z"),
				kind: "past",
				outcome: "success",
				scheduleLabel: "Daily",
			},
			{
				id: "b",
				jobId: "job-b",
				jobName: "B",
				start: new Date("2026-01-05T10:00:00.000Z"),
				kind: "upcoming",
				scheduleLabel: "Hourly",
			},
			{
				id: "c",
				jobId: "job-a",
				jobName: "A",
				start: new Date("2026-01-05T11:00:00.000Z"),
				kind: "past",
				outcome: "failure",
				scheduleLabel: "Daily",
			},
		];

		const grouped = groupEventsByJob(events);
		expect([...grouped.keys()]).toEqual(["job-a", "job-b"]);
		expect(grouped.get("job-a")?.map((event) => event.id)).toEqual(["a", "c"]);
		expect(grouped.get("job-b")?.map((event) => event.id)).toEqual(["b"]);
	});
});
