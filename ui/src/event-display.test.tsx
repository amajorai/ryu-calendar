import { describe, expect, it } from "bun:test";
import { eventTone } from "./event-display.tsx";
import type { CalendarEvent } from "./lib/events.ts";

function event(
	kind: CalendarEvent["kind"],
	outcome?: CalendarEvent["outcome"]
): CalendarEvent {
	return {
		id: "event-1",
		jobId: "job-1",
		jobName: "Daily report",
		kind,
		outcome,
		scheduleLabel: "Daily at 9 AM",
		start: new Date("2026-09-28T09:00:00.000Z"),
	};
}

describe("calendar event tone", () => {
	it("uses the upcoming tone for projected runs", () => {
		expect(eventTone(event("upcoming"))).toBe("upcoming");
	});

	it("uses semantic outcome tones for completed runs", () => {
		expect(eventTone(event("past", "success"))).toBe("success");
		expect(eventTone(event("past", "failure"))).toBe("failure");
	});
});
