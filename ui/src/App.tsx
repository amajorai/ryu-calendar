// The Calendar companion root — the port of the desktop `pages/CalendarPage.tsx`.
// It loads scheduled jobs + workflow names over the `window.ryu` bridge (the
// desktop page read `useSchedules()` + `useWorkflows()`), builds the same id→name
// map, and renders the byte-identical `CalendarContent` tree. The jobs query polls
// every 15s (the desktop hook reloaded on Core-refresh events the sandbox can't
// see); `onReload` triggers a manual refetch, and the New-automation dialog's
// `onCreated` refetches so a freshly scheduled run appears immediately.

import { useMemo } from "react";
import { fetchJobs, fetchWorkflows } from "./bridge.ts";
import { CalendarContent } from "./CalendarContent.tsx";
import { useQuery } from "./query.ts";

const POLL_MS = 15_000;

export function App() {
	const jobsQuery = useQuery({
		queryKey: ["calendar-jobs"],
		queryFn: () => fetchJobs(),
		refetchInterval: POLL_MS,
	});
	const workflowsQuery = useQuery({
		queryKey: ["calendar-workflows"],
		queryFn: () => fetchWorkflows(),
	});

	const jobs = jobsQuery.data ?? [];
	const workflows = workflowsQuery.data ?? [];

	const workflowNames = useMemo(
		() => new Map(workflows.map((w): [string, string] => [w.id, w.name])),
		[workflows]
	);

	return (
		<CalendarContent
			error={
				jobsQuery.isError
					? "We couldn't load your schedules. Please try again."
					: null
			}
			jobs={jobs}
			loading={jobsQuery.isLoading}
			onReload={async () => {
				jobsQuery.refetch();
			}}
			workflowNames={workflowNames}
		/>
	);
}
