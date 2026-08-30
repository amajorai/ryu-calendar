import { expect, test } from "bun:test";

const DST_CHECK = `
import { buildCalendarEvents } from "./src/lib/events.ts";

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

console.log(JSON.stringify([
	summarize("2026-03-08T00:00:00", "2026-03-09T00:00:00", "spring"),
	summarize("2026-11-01T00:00:00", "2026-11-02T00:00:00", "fall"),
]));
`;

test("sub-hourly interval aggregates follow local DST day boundaries", () => {
	const result = Bun.spawnSync([process.execPath, "-e", DST_CHECK], {
		cwd: process.cwd(),
		env: { ...process.env, TZ: "America/New_York" },
		stderr: "pipe",
		stdout: "pipe",
	});

	expect(result.success).toBe(true);
	expect(new TextDecoder().decode(result.stdout).trim()).toBe(
		JSON.stringify([
			{ count: 92, hour: 12 },
			{ count: 100, hour: 12 },
		])
	);
});
