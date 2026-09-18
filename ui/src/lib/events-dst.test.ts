import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

const DST_CHECK = `
import { buildCalendarEvents } from "./events.ts";

function summarize(startText, endText, id) {
	const start = new Date(startText);
	const end = new Date(endText);
	const job = {
		id,
		name: id,
		enabled: true,
		system: false,
		requireApproval: false,
		createdAt: start.toISOString(),
		updatedAt: start.toISOString(),
		lastRunAt: null,
		lastOutcome: null,
		history: [],
		schedule: { kind: "every", interval: "15m" },
		target: { type: "agent", agentId: "agent1", prompt: "hi" },
	};
	const [event] = buildCalendarEvents([job], start, end);
	return { count: event?.aggregateCount, hour: event?.start.getHours() };
}

const summary = JSON.stringify([
	summarize("2026-03-08T00:00:00", "2026-03-09T00:00:00", "spring"),
	summarize("2026-11-01T00:00:00", "2026-11-02T00:00:00", "fall"),
]);
if (summary !== JSON.stringify([
	{ count: 92, hour: 12 },
	{ count: 100, hour: 12 },
])) {
	process.exit(1);
}
`;

test("sub-hourly interval aggregates follow local DST day boundaries", () => {
	expect(() => {
		execFileSync(process.execPath, ["-e", DST_CHECK], {
			cwd: import.meta.dir,
			env: {
				HOME: process.env.HOME ?? "",
				NODE_ENV: "test",
				PATH: process.env.PATH ?? "",
				TMPDIR: process.env.TMPDIR ?? "",
				TZ: "America/New_York",
			},
			stdio: "ignore",
		});
	}).not.toThrow();
});
