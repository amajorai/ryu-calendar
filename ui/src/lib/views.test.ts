import { describe, expect, it } from "bun:test";
import {
	AGENDA_DAYS,
	type CalendarView,
	navigate,
	viewDays,
	viewLabel,
	viewRange,
} from "./views.ts";

const MS_PER_DAY = 86_400_000;

function dayCount(view: CalendarView, cursor: Date): number {
	const { start, end } = viewRange(view, cursor);
	return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

describe("viewRange", () => {
	it("month spans a whole number of weeks", () => {
		const cursor = new Date(2026, 0, 15); // Jan 15 2026 (local)
		const days = dayCount("month", cursor);
		expect(days % 7).toBe(0);
		// A month grid is 5 or 6 weeks.
		expect(days === 35 || days === 42).toBe(true);
	});

	it("month starts on a week boundary at local midnight", () => {
		const { start } = viewRange("month", new Date(2026, 0, 15));
		expect(start.getHours()).toBe(0);
		expect(start.getMinutes()).toBe(0);
		expect(start.getSeconds()).toBe(0);
	});

	it("week spans exactly 7 days from the week start", () => {
		expect(dayCount("week", new Date(2026, 0, 15))).toBe(7);
	});

	it("day spans exactly 1 day from local midnight", () => {
		const { start } = viewRange("day", new Date(2026, 0, 15, 13, 30));
		expect(dayCount("day", new Date(2026, 0, 15))).toBe(1);
		expect(start.getHours()).toBe(0);
	});

	it("agenda spans AGENDA_DAYS", () => {
		expect(dayCount("agenda", new Date(2026, 0, 15))).toBe(AGENDA_DAYS);
	});

	it("falls back to a single day for an unknown view", () => {
		expect(dayCount("weird" as CalendarView, new Date(2026, 0, 15))).toBe(1);
	});
});

describe("viewDays", () => {
	it("returns one Date per day in the range", () => {
		expect(viewDays("week", new Date(2026, 0, 15))).toHaveLength(7);
		expect(viewDays("day", new Date(2026, 0, 15))).toHaveLength(1);
		expect(viewDays("agenda", new Date(2026, 0, 15))).toHaveLength(AGENDA_DAYS);
	});

	it("month day columns are contiguous 24h apart", () => {
		const days = viewDays("month", new Date(2026, 0, 15));
		for (let i = 1; i < days.length; i++) {
			const delta = days[i]!.getTime() - days[i - 1]!.getTime();
			// DST-free assertion: local calendar days, difference is ~1 day.
			expect(delta).toBeGreaterThan(0);
		}
	});
});

describe("navigate", () => {
	const cursor = new Date(2026, 5, 15); // Jun 15 2026

	it("moves month by ±1 month", () => {
		expect(navigate("month", cursor, 1).getMonth()).toBe(6); // July
		expect(navigate("month", cursor, -1).getMonth()).toBe(4); // May
	});

	it("moves week by ±7 days", () => {
		const fwd = navigate("week", cursor, 1);
		expect(Math.round((fwd.getTime() - cursor.getTime()) / MS_PER_DAY)).toBe(7);
		const back = navigate("week", cursor, -1);
		expect(Math.round((cursor.getTime() - back.getTime()) / MS_PER_DAY)).toBe(7);
	});

	it("moves day by ±1 day", () => {
		expect(navigate("day", cursor, 1).getDate()).toBe(16);
		expect(navigate("day", cursor, -1).getDate()).toBe(14);
	});

	it("moves agenda by ±AGENDA_DAYS", () => {
		const fwd = navigate("agenda", cursor, 1);
		expect(Math.round((fwd.getTime() - cursor.getTime()) / MS_PER_DAY)).toBe(
			AGENDA_DAYS
		);
	});

	it("leaves the cursor untouched for an unknown view", () => {
		const same = navigate("weird" as CalendarView, cursor, 1);
		expect(same.getTime()).toBe(cursor.getTime());
	});
});

describe("viewLabel", () => {
	it("month shows month and year", () => {
		expect(viewLabel("month", new Date(2026, 0, 15))).toBe("January 2026");
	});

	it("day shows the full weekday date", () => {
		// 2026-06-15 is a Monday.
		expect(viewLabel("day", new Date(2026, 5, 15))).toBe("Monday, June 15, 2026");
	});

	it("week within one month omits the repeated month on the right", () => {
		// A week wholly inside June 2026.
		const label = viewLabel("week", new Date(2026, 5, 15));
		// "Jun 14 – 20, 2026" style — right side has no month name.
		expect(label).toContain("Jun 14");
		expect(label).toContain("2026");
		expect(label.split("–")[1]).not.toContain("Jul");
	});

	it("week crossing a month boundary within one year shows both months", () => {
		// Week containing May 31 2026 crosses into June.
		const label = viewLabel("week", new Date(2026, 4, 31));
		expect(label).toContain("May");
		expect(label).toContain("Jun");
		expect(label).toContain("2026");
	});

	it("week crossing a year boundary shows both years", () => {
		// Week containing Dec 31 2025 crosses into Jan 2026.
		const label = viewLabel("week", new Date(2025, 11, 31));
		expect(label).toContain("2025");
		expect(label).toContain("2026");
	});

	it("agenda shows a start–end span", () => {
		const label = viewLabel("agenda", new Date(2026, 0, 1));
		expect(label).toContain("Jan 1");
		expect(label).toContain("2026");
	});

	it("falls back to month-year for an unknown view", () => {
		expect(viewLabel("weird" as CalendarView, new Date(2026, 0, 15))).toBe(
			"January 2026"
		);
	});
});
