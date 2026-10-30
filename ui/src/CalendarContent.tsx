import {
	ArrowLeft01Icon,
	CalendarCheckIn01Icon,
	PlusSignIcon,
	Refresh01Icon,
	ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { Toggle } from "@ryu/ui/components/toggle.tsx";
import { cn } from "@ryu/ui/lib/utils.ts";
import { useMemo, useState } from "react";
import { AgendaView } from "./AgendaView.tsx";
import { DayPanel, MonthView } from "./CalendarContent-month-view.tsx";
import {
	buildCalendarEvents,
	type CalendarEvent,
	eventDayKey,
	groupEventsByDay,
} from "./lib/events.ts";
import {
	CALENDAR_VIEWS,
	type CalendarView,
	navigate,
	viewDays,
	viewLabel,
	viewRange,
} from "./lib/views.ts";
import { NewAutomationDialog } from "./NewAutomationDialog.tsx";
import { TimeGridView } from "./TimeGridView.tsx";
import type { ScheduledJob } from "./types.ts";

export interface CalendarContentProps {
	defaultAgentId?: string;
	/** The view the calendar opens on (narrow embeds prefer `agenda`). */
	defaultView?: CalendarView;
	emptyDescription?: string;
	emptyTitle?: string;
	error: string | null;
	jobs: ScheduledJob[];
	loading: boolean;
	onReload: () => Promise<void>;
	workflowNames: Map<string, string>;
}

export function CalendarContent({
	jobs,
	workflowNames,
	loading,
	error,
	onReload,
	defaultAgentId,
	defaultView = "month",
	emptyTitle = "No scheduled runs",
	emptyDescription = "Create an automation to see agent and workflow runs appear on the calendar.",
}: CalendarContentProps) {
	const [view, setView] = useState<CalendarView>(defaultView);
	const [cursor, setCursor] = useState(() => new Date());
	const [selectedDay, setSelectedDay] = useState<Date | null>(null);
	const [newAutomationOpen, setNewAutomationOpen] = useState(false);
	// Core's internal maintenance jobs (identity-vault health, continual-learning
	// cycle) fire hourly and would wall-to-wall the grid, so they are hidden
	// unless the user opts in via the toolbar toggle.
	const [showSystemJobs, setShowSystemJobs] = useState(false);

	const days = useMemo(() => viewDays(view, cursor), [view, cursor]);
	const range = useMemo(() => viewRange(view, cursor), [view, cursor]);

	const hasSystemJobs = useMemo(() => jobs.some((j) => j.system), [jobs]);
	const visibleJobs = useMemo(
		() => (showSystemJobs ? jobs : jobs.filter((j) => !j.system)),
		[jobs, showSystemJobs]
	);

	const eventsByDay = useMemo(() => {
		const events = buildCalendarEvents(
			visibleJobs,
			range.start,
			range.end,
			workflowNames,
			new Date()
		);
		return groupEventsByDay(events);
	}, [visibleJobs, range, workflowNames]);

	const selectedDayEvents = useMemo(() => {
		if (!selectedDay) {
			return [];
		}
		return eventsByDay.get(eventDayKey(selectedDay)) ?? [];
	}, [selectedDay, eventsByDay]);

	const handleSelectEvent = (event: CalendarEvent) => {
		setSelectedDay(event.start);
	};

	const goToday = () => {
		const now = new Date();
		setCursor(now);
		setSelectedDay(now);
	};

	const handleRefresh = () => {
		onReload();
	};

	// Only take over the whole surface until the very first load settles. After
	// that, a refresh keeps the toolbar and calendar in place (the Refresh
	// control spins instead) so the view never blanks out. An empty calendar is
	// loaded data too: blanking it would unmount the New-automation dialog and
	// discard its chosen agent and approval setting on the post-create refetch.
	const [firstLoadSettled, setFirstLoadSettled] = useState(!loading);
	if (!(loading || firstLoadSettled)) {
		setFirstLoadSettled(true);
	}
	if (loading && !firstLoadSettled) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (error) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={CalendarCheckIn01Icon} />
					</EmptyMedia>
					<EmptyTitle>Could not load calendar</EmptyTitle>
					<EmptyDescription>
						Something went wrong while loading your schedules or workflow names.
						Check your connection and try again.
					</EmptyDescription>
				</EmptyHeader>
				<Button className="mt-4" disabled={loading} onClick={handleRefresh}>
					<HugeiconsIcon
						className={cn("size-4", loading && "animate-spin")}
						icon={Refresh01Icon}
					/>
					Try again
				</Button>
			</Empty>
		);
	}

	return (
		<div className="relative flex h-full flex-col overflow-hidden">
			{visibleJobs.length === 0 ? (
				<div className="h-full pb-24">
					<Empty className="h-full">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<HugeiconsIcon icon={ZapIcon} />
							</EmptyMedia>
							<EmptyTitle>{emptyTitle}</EmptyTitle>
							<EmptyDescription>{emptyDescription}</EmptyDescription>
							<Button
								className="mt-4"
								onClick={() => setNewAutomationOpen(true)}
								size="sm"
							>
								<HugeiconsIcon className="size-4" icon={PlusSignIcon} />
								New automation
							</Button>
						</EmptyHeader>
					</Empty>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 pb-20">
					{view === "month" && (
						<MonthView
							cursor={cursor}
							days={days}
							eventsByDay={eventsByDay}
							onSelectDay={setSelectedDay}
							onSelectEvent={handleSelectEvent}
							selectedDay={selectedDay}
						/>
					)}
					{(view === "week" || view === "day") && (
						<TimeGridView
							days={days}
							eventsByDay={eventsByDay}
							onSelectEvent={handleSelectEvent}
						/>
					)}
					{view === "agenda" && (
						<AgendaView
							days={days}
							eventsByDay={eventsByDay}
							jobs={visibleJobs}
						/>
					)}

					{view !== "agenda" && selectedDay && (
						<DayPanel
							day={selectedDay}
							events={selectedDayEvents}
							onClose={() => setSelectedDay(null)}
						/>
					)}
				</div>
			)}

			{/* Floating bottom toolbar — beUI-style pill, matching the Store's
			    StoreSectionNav (packages/blocks/src/desktop/store.tsx): a centered,
			    rounded, frosted pill that floats above the calendar. Holds the date
			    navigation, the view switcher, and the section actions, so nothing
			    sits above the grid anymore. */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 py-3">
				<div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-muted/70 p-1.5 shadow-lg backdrop-blur-md">
					<Button
						aria-label="Previous"
						onClick={() => setCursor((c) => navigate(view, c, -1))}
						size="icon-sm"
						title="Previous"
						variant="ghost"
					>
						<HugeiconsIcon className="size-4" icon={ArrowLeft01Icon} />
					</Button>
					<Button onClick={goToday} size="sm" variant="ghost">
						Today
					</Button>
					<Button
						aria-label="Next"
						onClick={() => setCursor((c) => navigate(view, c, 1))}
						size="icon-sm"
						title="Next"
						variant="ghost"
					>
						<HugeiconsIcon
							className="size-4 rotate-180"
							icon={ArrowLeft01Icon}
						/>
					</Button>
					<span className="px-2 font-medium text-sm tabular-nums">
						{viewLabel(view, cursor)}
					</span>

					<span
						aria-hidden
						className="mx-0.5 h-5 w-px shrink-0 self-center bg-border/60"
					/>

					{CALENDAR_VIEWS.map((option) => (
						<Button
							key={option.value}
							onClick={() => setView(option.value)}
							size="sm"
							variant={view === option.value ? "secondary" : "ghost"}
						>
							{option.label}
						</Button>
					))}

					<span
						aria-hidden
						className="mx-0.5 h-5 w-px shrink-0 self-center bg-border/60"
					/>

					{hasSystemJobs && (
						<Toggle
							aria-label="Show system jobs"
							onPressedChange={setShowSystemJobs}
							pressed={showSystemJobs}
							size="sm"
							title="Show Ryu's internal maintenance jobs on the calendar"
						>
							System jobs
						</Toggle>
					)}
					<Button
						aria-label="Refresh"
						disabled={loading}
						onClick={handleRefresh}
						size="icon-sm"
						title="Refresh"
						variant="ghost"
					>
						<HugeiconsIcon
							className={cn("size-4", loading && "animate-spin")}
							icon={Refresh01Icon}
						/>
					</Button>
					<Button onClick={() => setNewAutomationOpen(true)} size="sm">
						<HugeiconsIcon className="size-4" icon={PlusSignIcon} />
						New automation
					</Button>
				</div>
			</div>

			<NewAutomationDialog
				defaultAgentId={defaultAgentId}
				onCreated={onReload}
				onOpenChange={setNewAutomationOpen}
				open={newAutomationOpen}
			/>
		</div>
	);
}
