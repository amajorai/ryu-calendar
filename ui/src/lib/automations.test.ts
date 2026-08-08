import { describe, expect, it } from "bun:test";
import { phraseToSchedule, type SchedulePhrase } from "./automations.ts";

describe("phraseToSchedule", () => {
	it("maps everyminute and hourly to interval schedules", () => {
		expect(phraseToSchedule("everyminute", "", "", "", "")).toEqual({
			kind: "every",
			interval: "1m",
		});
		expect(phraseToSchedule("hourly", "", "", "", "")).toEqual({
			kind: "every",
			interval: "1h",
		});
	});

	it("builds a daily cron from HH:MM, preserving the picker's parts verbatim", () => {
		expect(phraseToSchedule("daily", "14:30", "", "", "")).toEqual({
			kind: "cron",
			expr: "30 14 * * *",
		});
	});

	it("defaults the minute to 0 when the time has no colon", () => {
		// A bare hour ("14") splits to a single element → minute default kicks in.
		expect(phraseToSchedule("daily", "14", "", "", "")).toEqual({
			kind: "cron",
			expr: "0 14 * * *",
		});
	});

	it("builds weekday (1-5) and weekend (0,6) crons keeping HH:MM verbatim", () => {
		expect(phraseToSchedule("weekdays", "08:00", "", "", "")).toEqual({
			kind: "cron",
			expr: "00 08 * * 1-5",
		});
		expect(phraseToSchedule("weekends", "10:15", "", "", "")).toEqual({
			kind: "cron",
			expr: "15 10 * * 0,6",
		});
	});

	it("maps a named weekly day to its cron day-of-week", () => {
		expect(phraseToSchedule("weekly", "", "wednesday", "07:45", "")).toEqual({
			kind: "cron",
			expr: "45 07 * * 3",
		});
		expect(phraseToSchedule("weekly", "", "sunday", "06:00", "")).toEqual({
			kind: "cron",
			expr: "00 06 * * 0",
		});
	});

	it("defaults an unknown weekly day to Monday (1)", () => {
		expect(phraseToSchedule("weekly", "", "notaday", "09:00", "")).toEqual({
			kind: "cron",
			expr: "00 09 * * 1",
		});
	});

	it("passes a custom cron through verbatim", () => {
		expect(phraseToSchedule("custom", "", "", "", "*/10 * * * *")).toEqual({
			kind: "cron",
			expr: "*/10 * * * *",
		});
	});

	it("treats any unrecognised phrase as custom (raw cron field)", () => {
		expect(
			phraseToSchedule("mystery" as SchedulePhrase, "", "", "", "5 5 * * *")
		).toEqual({ kind: "cron", expr: "5 5 * * *" });
	});
});
