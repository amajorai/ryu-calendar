// Schedule phrasing and interval parsing for the Calendar projection in
// `events.ts`, which re-exports `describeSchedule` from here.

import { dateFormatter } from "@ryu/i18n/format-intl";
import type { LiteralMessage } from "@ryu/i18n/react";
import { formatHourLabel, getDisplayLocale } from "@ryu/ui/lib/timezone.ts";
import type { Schedule } from "../types.ts";

// ── Schedule formatting ──────────────────────────────────────────────────────

const DAILY_CRON = /^0 (\d+) \* \* \*$/;
const WEEKLY_CRON = /^0 (\d+) \* \* (\d)$/;
/** A cron hour as the UI locale writes it ("9 AM", "9時", "9 Uhr"). */
const HOUR_ONLY: Intl.DateTimeFormatOptions = { hour: "numeric" };

/**
 * A cron weekday (0 = Sunday) in the UI locale, or the raw text when out of
 * range. 2 January 2000 was a Sunday; UTC keeps that date fixed in every zone.
 */
function cronWeekdayLabel(raw: string): string {
	const day = Number(raw);
	if (!Number.isInteger(day) || day < 0 || day > 6) {
		return raw;
	}
	return dateFormatter(getDisplayLocale(), {
		timeZone: "UTC",
		weekday: "long",
	}).format(new Date(Date.UTC(2000, 0, 2 + day)));
}

/** Human-readable phrase for a job's schedule, shared with the automations list. */
export function describeSchedule(
	tl: LiteralMessage,
	schedule: Schedule
): string {
	if (schedule.kind === "every") {
		switch (schedule.interval) {
			case "5m":
				return tl("Every 5 minutes");
			case "10m":
				return tl("Every 10 minutes");
			case "15m":
				return tl("Every 15 minutes");
			case "30m":
				return tl("Every 30 minutes");
			case "1h":
			case "3600":
				return tl("Every hour");
			default:
				return tl("Every {interval}", { interval: schedule.interval });
		}
	}
	const expr = schedule.expr.trim();
	const daily = DAILY_CRON.exec(expr);
	if (daily) {
		return tl("Daily at {time}", {
			time: formatHourLabel(Number(daily[1]), HOUR_ONLY),
		});
	}
	const weekly = WEEKLY_CRON.exec(expr);
	if (weekly) {
		const day = cronWeekdayLabel(weekly[2] ?? "");
		return tl("Weekly on {day} at {time}", {
			day,
			time: formatHourLabel(Number(weekly[1]), HOUR_ONLY),
		});
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
