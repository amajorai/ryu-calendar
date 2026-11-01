// apps/desktop/src/components/calendar/TimeGridView.tsx
//
// Time-grid view shared by the Week (7 columns) and Day (1 column) calendar
// modes, modelled on origin-space/event-calendar. Hours run down the left
// gutter; each day is a column in which events are absolutely positioned by
// their start time. Scheduled runs are point-in-time (no end), so each is drawn
// as a fixed-height block and overlapping blocks are split into side-by-side
// lanes so none is hidden.

import { Button } from "@ryu/ui/components/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ryu/ui/components/tooltip.tsx";
import {
	formatDate as formatDisplayDate,
	formatTime as formatDisplayTime,
	formatHourLabel,
} from "@ryu/ui/lib/timezone.ts";
import { cn } from "@ryu/ui/lib/utils.ts";
import { isToday } from "date-fns";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";

import { eventTone } from "./event-display.tsx";
import { type CalendarEvent, eventDayKey } from "./lib/events.ts";

interface CalendarPositionStyle extends CSSProperties {
	"--calendar-event-height"?: string;
	"--calendar-event-left"?: string;
	"--calendar-event-top": string;
	"--calendar-event-width"?: string;
}

const HOUR_HEIGHT = 48; // px per hour row
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const BLOCK_MINUTES = 30; // visual duration given to each point-in-time run
const SCROLL_TO_HOUR = 7; // initial scroll position (business hours)

function minutesIntoDay(date: Date): number {
	return date.getHours() * 60 + date.getMinutes();
}

interface PlacedEvent {
	event: CalendarEvent;
	lane: number;
	lanes: number;
}

/** Pack a day's events into the fewest side-by-side lanes without overlap. */
function packLanes(events: CalendarEvent[]): PlacedEvent[] {
	const sorted = [...events].sort(
		(a, b) => a.start.getTime() - b.start.getTime()
	);
	const laneEnds: number[] = [];
	const placed = sorted.map((event) => {
		const startMs = event.start.getTime();
		const endMs = startMs + BLOCK_MINUTES * 60_000;
		let lane = laneEnds.findIndex((end) => end <= startMs);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(endMs);
		} else {
			laneEnds[lane] = endMs;
		}
		return { event, lane };
	});
	const lanes = laneEnds.length || 1;
	return placed.map((p) => ({ ...p, lanes }));
}

function TimeGridEvent({
	placed,
	onSelect,
}: {
	placed: PlacedEvent;
	onSelect: (event: CalendarEvent) => void;
}) {
	const { event, lane, lanes } = placed;
	const top = (minutesIntoDay(event.start) / 60) * HOUR_HEIGHT;
	const height = (BLOCK_MINUTES / 60) * HOUR_HEIGHT;
	const widthPct = 100 / lanes;
	const position: CalendarPositionStyle = {
		"--calendar-event-top": `${top}px`,
		"--calendar-event-height": `${Math.max(height, 18)}px`,
		"--calendar-event-left": `${lane * widthPct}%`,
		"--calendar-event-width": `calc(${widthPct}% - 2px)`,
	};
	return (
		<div className="calendar-event-position absolute" style={position}>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							className="h-full w-full overflow-hidden"
							data-calendar-event-tone={eventTone(event)}
							onClick={(e) => {
								e.stopPropagation();
								onSelect(event);
							}}
							size="xs"
							type="button"
							variant="outline"
						>
							<span className="flex items-center gap-1 truncate text-xs leading-tight">
								<span className="shrink-0 font-medium tabular-nums opacity-70">
									{event.aggregateCount
										? `${event.aggregateCount}×`
										: formatDisplayTime(event.start, {
												hour: "2-digit",
												minute: "2-digit",
											})}
								</span>
								<span className="truncate" title={event.jobName}>
									{event.jobName}
								</span>
							</span>
						</Button>
					}
				/>
				<TooltipContent>{`${event.jobName} — ${event.scheduleLabel}`}</TooltipContent>
			</Tooltip>
		</div>
	);
}

/** Red "now" indicator line, shown only inside today's column. */
function NowIndicator() {
	const top = (minutesIntoDay(new Date()) / 60) * HOUR_HEIGHT;
	const position: CalendarPositionStyle = {
		"--calendar-event-top": `${top}px`,
	};
	return (
		<div
			className="calendar-now-position pointer-events-none absolute right-0 left-0 z-10 flex items-center"
			style={position}
		>
			<span className="-ml-1 size-2 rounded-full bg-destructive" />
			<span className="h-px flex-1 bg-destructive" />
		</div>
	);
}

export function TimeGridView({
	days,
	eventsByDay,
	onSelectEvent,
}: {
	days: Date[];
	eventsByDay: Map<string, CalendarEvent[]>;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const placedByDay = useMemo(
		() => days.map((day) => packLanes(eventsByDay.get(eventDayKey(day)) ?? [])),
		[days, eventsByDay]
	);

	// Scroll to business hours on mount. (The desktop source kept an unused
	// `_rangeKey` local here; it is dropped so the companion's `noUnusedLocals`
	// passes — the effect's `[]` deps already made it mount-only, so behavior is
	// unchanged.)
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT;
		}
	}, []);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Column headers (one per day) */}
			<div className="calendar-scrollbar-padding flex shrink-0 border-b">
				<div className="w-14 shrink-0 border-r" />
				{days.map((day) => {
					const today = isToday(day);
					return (
						<div
							className="flex-1 border-r py-1.5 text-center last:border-r-0"
							key={eventDayKey(day)}
						>
							<div className="font-medium text-muted-foreground text-xs">
								{formatDisplayDate(day, { weekday: "short" })}
							</div>
							<div
								className={cn(
									"mx-auto flex size-6 items-center justify-center rounded-full text-sm",
									today
										? "bg-primary font-medium text-primary-foreground"
										: "text-foreground"
								)}
							>
								{formatDisplayDate(day, { day: "numeric" })}
							</div>
						</div>
					);
				})}
			</div>

			{/* Scrollable hour grid */}
			<div
				className="scroll-fade-effect-y min-h-0 flex-1 overflow-auto"
				ref={scrollRef}
			>
				<div className="flex">
					{/* Hour gutter */}
					<div className="w-14 shrink-0">
						{HOURS.map((hour) => (
							<div className="relative h-12 border-r" key={hour}>
								<span className="absolute -top-2 right-1.5 text-muted-foreground text-xs tabular-nums">
									{hour === 0 ? "" : formatHourLabel(hour)}
								</span>
							</div>
						))}
					</div>

					{/* Day columns */}
					{days.map((day, dayIndex) => (
						<div
							className="relative flex-1 border-r last:border-r-0"
							key={eventDayKey(day)}
						>
							{HOURS.map((hour) => (
								<div className="h-12 border-b" key={hour} />
							))}
							{isToday(day) && <NowIndicator />}
							{(placedByDay[dayIndex] ?? []).map((placed) => (
								<TimeGridEvent
									key={placed.event.id}
									onSelect={onSelectEvent}
									placed={placed}
								/>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
