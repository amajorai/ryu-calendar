// Schedule phrasing and interval parsing for the Calendar projection in
// `events.ts`, which re-exports `describeSchedule` from here.

import { formatHourLabel } from "@ryu/ui/lib/timezone.ts";
import type { Schedule } from "../types.ts";

// ── Schedule formatting ──────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

const DAILY_CRON = /^0 (\d+) \* \* \*$/;
const WEEKLY_CRON = /^0 (\d+) \* \* (\d)$/;

/** Human-readable phrase for a job's schedule, shared with the automations list. */
export function describeSchedule(schedule: Schedule): string {
	if (schedule.kind === "every") {
		const map = new Map(
			Object.entries({
				"5m": "Every 5 minutes",
				"10m": "Every 10 minutes",
				"15m": "Every 15 minutes",
				"30m": "Every 30 minutes",
				"1h": "Every hour",
				"3600": "Every hour",
			})
		);
		return map.get(schedule.interval) ?? `Every ${schedule.interval}`;
	}
	const expr = schedule.expr.trim();
	const daily = DAILY_CRON.exec(expr);
	if (daily) {
		return `Daily at ${formatHourLabel(Number(daily[1]), { hour: "numeric" })}`;
	}
	const weekly = WEEKLY_CRON.exec(expr);
	if (weekly) {
		const day = DAYS_OF_WEEK[Number(weekly[2])] ?? weekly[2];
		return `Weekly on ${day} at ${formatHourLabel(Number(weekly[1]), {
			hour: "numeric",
		})}`;
	}
	return `cron: ${expr}`;
}

// ── Interval parsing ─────────────────────────────────────────────────────────

const INTERVAL_RE = /^(\d+)\s*(s|m|h|d)?$/;

/** Parse Core's humantime-ish intervals ("5m", "30s", "1h", or bare seconds). */
export function parseIntervalSeconds(interval: string): number | null {
	const match = INTERVAL_RE.exec(interval.trim());
	if (!match) {
		return null;
	}
	const value = Number(match[1]);
	if (!Number.isFinite(value) || value <= 0) {
		return null;
	}
	switch (match[2]) {
		case "s":
		case undefined:
			return value;
		case "m":
			return value * 60;
		case "h":
			return value * 3600;
		case "d":
			return value * 86_400;
		default:
			return null;
	}
}
