import { expect, test } from "bun:test";
import { buildCalendarEvents } from "./events";

test("sub-hourly interval aggregates follow local DST day boundaries", () => {
	const previousTimezone = process.env.TZ;
	process.env.TZ = "America/New_York";
	try {
		const summarize = (startText: string, endText: string, id: string) => {
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
				schedule: { kind: "every" as const, interval: "15m" as const },
				target: { type: "agent" as const, agentId: "agent1", prompt: "hi" },
			};
			const [event] = buildCalendarEvents([job], start, end);
			return { count: event?.aggregateCount, hour: event?.start.getHours() };
		};

		expect(
			summarize("2026-03-08T00:00:00", "2026-03-09T00:00:00", "spring")
		).toEqual({ count: 92, hour: 12 });
		expect(
			summarize("2026-11-01T00:00:00", "2026-11-02T00:00:00", "fall")
		).toEqual({ count: 100, hour: 12 });
	} finally {
		if (previousTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTimezone;
		}
	}
});
