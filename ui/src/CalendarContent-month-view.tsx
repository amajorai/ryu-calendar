import {
	ArrowLeft01Icon,
	CalendarCheckIn01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ryu/ui/components/tooltip.tsx";
import { formatDate as formatDisplayDate } from "@ryu/ui/lib/timezone.ts";
import { cn } from "@ryu/ui/lib/utils.ts";
import { isSameDay, isSameMonth, isToday } from "date-fns";
import { EventRow, eventTime, eventTone } from "./event-display.tsx";
import { type CalendarEvent, eventDayKey } from "./lib/events.ts";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PILLS_PER_CELL = 3;

function EventPill({
	event,
	onSelect,
}: {
	event: CalendarEvent;
	onSelect: (event: CalendarEvent) => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						className="w-full justify-start"
						data-calendar-event-tone={eventTone(event)}
						onClick={(e) => {
							e.stopPropagation();
							onSelect(event);
						}}
						size="xs"
						type="button"
						variant="outline"
					>
						<span className="flex min-w-0 items-center gap-1 truncate text-xs leading-tight">
							<span className="shrink-0 font-medium tabular-nums opacity-70">
								{eventTime(event)}
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
	);
}

function DayCell({
	day,
	monthCursor,
	events,
	selected,
	onSelectDay,
	onSelectEvent,
}: {
	day: Date;
	monthCursor: Date;
	events: CalendarEvent[];
	selected: boolean;
	onSelectDay: (day: Date) => void;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	const inMonth = isSameMonth(day, monthCursor);
	const today = isToday(day);
	const overflow = events.length - MAX_PILLS_PER_CELL;
	const tl = useLiteralMessages();

	return (
		<Button
			aria-pressed={selected}
			className="w-full"
			data-calendar-day-cell=""
			data-calendar-in-month={inMonth}
			data-calendar-selected={selected}
			onClick={() => onSelectDay(day)}
			size="sm"
			type="button"
			variant={inMonth ? "ghost" : "ghost-muted"}
		>
			<div className="flex h-full w-full flex-col gap-1">
				<div className="flex items-center justify-between">
					<span
						className={cn(
							"flex size-6 items-center justify-center rounded-full text-xs",
							today && "bg-primary font-medium text-primary-foreground",
							!(today || inMonth) && "text-muted-foreground/50",
							!today && inMonth && "text-foreground"
						)}
					>
						{formatDisplayDate(day, { day: "numeric" })}
					</span>
					{events.length > 0 && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{events.length}
						</span>
					)}
				</div>
				<div className="flex flex-col gap-0.5">
					{events.slice(0, MAX_PILLS_PER_CELL).map((event) => (
						<EventPill event={event} key={event.id} onSelect={onSelectEvent} />
					))}
					{overflow > 0 && (
						<span className="px-1 text-muted-foreground text-xs">
							{tl("+{overflow} more", { overflow })}
						</span>
					)}
				</div>
			</div>
		</Button>
	);
}

export function MonthView({
	cursor,
	days,
	eventsByDay,
	selectedDay,
	onSelectDay,
	onSelectEvent,
}: {
	cursor: Date;
	days: Date[];
	eventsByDay: Map<string, CalendarEvent[]>;
	selectedDay: Date | null;
	onSelectDay: (day: Date) => void;
	onSelectEvent: (event: CalendarEvent) => void;
}) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="grid shrink-0 grid-cols-7 border-b">
				{WEEKDAY_LABELS.map((label) => (
					<div
						className="border-r py-1.5 text-center font-medium text-muted-foreground text-xs last:border-r-0"
						key={label}
					>
						{label}
					</div>
				))}
			</div>
			<div className="grid flex-1 auto-rows-fr grid-cols-7 overflow-auto border-l">
				{days.map((day) => (
					<DayCell
						day={day}
						events={eventsByDay.get(eventDayKey(day)) ?? []}
						key={day.toISOString()}
						monthCursor={cursor}
						onSelectDay={onSelectDay}
						onSelectEvent={onSelectEvent}
						selected={!!selectedDay && isSameDay(day, selectedDay)}
					/>
				))}
			</div>
		</div>
	);
}

export function DayPanel({
	day,
	events,
	onClose,
}: {
	day: Date;
	events: CalendarEvent[];
	onClose: () => void;
}) {
	return (
		<aside className="flex w-72 shrink-0 flex-col border-l">
			<div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
				<div>
					<p className="font-medium text-sm">
						{formatDisplayDate(day, { weekday: "long" })}
					</p>
					<p className="text-muted-foreground text-xs">
						{formatDisplayDate(day, {
							month: "long",
							day: "numeric",
							year: "numeric",
						})}
					</p>
				</div>
				<Button
					aria-label="Close day"
					onClick={onClose}
					size="icon"
					variant="ghost"
				>
					<HugeiconsIcon className="size-4" icon={ArrowLeft01Icon} />
				</Button>
			</div>
			<div className="scroll-fade-effect-y flex-1 overflow-auto p-3">
				{events.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
						<HugeiconsIcon
							className="size-6 opacity-50"
							icon={CalendarCheckIn01Icon}
						/>
						<p className="text-sm">No runs scheduled</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{events.map((event) => (
							<EventRow event={event} key={event.id} />
						))}
					</div>
				)}
			</div>
		</aside>
	);
}
