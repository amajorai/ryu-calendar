// Pure schedule-phrase helpers ported verbatim from the desktop
// `apps/desktop/src/lib/automations.ts`. Only the PURE conversion the New-automation
// dialog needs lives here — `phraseToSchedule` (friendly phrase + detail controls →
// a Core `Schedule`). The composite `createScheduledAgentWorkflow` (fetch workflows,
// create-or-update the scheduled workflow, drain legacy agent jobs) is NOT here: it
// needs the node token, so it runs host-side and the frame reaches it through
// `bridge.ts` (`ryu().calendar.createAutomation`).

import type { Schedule } from "../types";

/** Friendly schedule choices offered by the schedule pickers. */
export type SchedulePhrase =
	| "everyminute"
	| "hourly"
	| "daily"
	| "weekdays"
	| "weekends"
	| "weekly"
	| "custom";

const WEEKDAY_TO_CRON: Record<string, string> = {
	monday: "1",
	tuesday: "2",
	wednesday: "3",
	thursday: "4",
	friday: "5",
	saturday: "6",
	sunday: "0",
};

/** Turn a friendly phrase + its detail controls into a Core {@link Schedule}. */
export function phraseToSchedule(
	phrase: SchedulePhrase,
	dailyTime: string,
	weeklyDay: string,
	weeklyTime: string,
	customCron: string
): Schedule {
	switch (phrase) {
		case "everyminute":
			return { kind: "every", interval: "1m" };
		case "hourly":
			return { kind: "every", interval: "1h" };
		case "daily": {
			const [hour = "9", minute = "0"] = dailyTime.split(":");
			return { kind: "cron", expr: `${minute} ${hour} * * *` };
		}
		case "weekdays": {
			const [hour = "9", minute = "0"] = dailyTime.split(":");
			return { kind: "cron", expr: `${minute} ${hour} * * 1-5` };
		}
		case "weekends": {
			const [hour = "9", minute = "0"] = dailyTime.split(":");
			return { kind: "cron", expr: `${minute} ${hour} * * 0,6` };
		}
		case "weekly": {
			const [hour = "9", minute = "0"] = weeklyTime.split(":");
			const dow = WEEKDAY_TO_CRON[weeklyDay] ?? "1";
			return { kind: "cron", expr: `${minute} ${hour} * * ${dow}` };
		}
		default:
			// "custom" (and any future phrase) falls back to the raw cron field.
			return { kind: "cron", expr: customCron };
	}
}
