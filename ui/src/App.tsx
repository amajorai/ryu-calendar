// The Calendar companion root — the port of the desktop `pages/CalendarPage.tsx`.
// It loads scheduled jobs + workflow names over the `window.ryu` bridge (the
// desktop page read `useSchedules()` + `useWorkflows()`), builds the same id→name
// map, and renders the byte-identical `CalendarContent` tree. The jobs query polls
// every 15s (the desktop hook reloaded on Core-refresh events the sandbox can't
// see); `onReload` triggers a manual refetch, and the New-automation dialog's
// `onCreated` refetches so a freshly scheduled run appears immediately.
// Mounted as an agent profile tab, it narrows to that agent's routines.

import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useMemo } from "react";
import { fetchJobs, fetchWorkflows } from "./bridge.ts";
import { CalendarContent } from "./CalendarContent.tsx";
import { agentScopeFromContext, jobsForScope } from "./mount-context.ts";

const POLL_MS = 15_000;

export function App() {
	const scope = useMemo(
		() => agentScopeFromContext(globalThis.window?.ryu?.context),
		[]
	);
	const jobsQuery = useQuery({
		queryKey: ["calendar-jobs"],
		queryFn: () => fetchJobs(),
		refetchInterval: POLL_MS,
	});
	const workflowsQuery = useQuery({
		queryKey: ["calendar-workflows"],
		queryFn: () => fetchWorkflows(),
	});

	const jobs = useMemo(
		() => jobsForScope(jobsQuery.data ?? [], scope),
		[jobsQuery.data, scope]
	);
	const workflows = workflowsQuery.data ?? [];

	const workflowNames = useMemo(
		() => new Map(workflows.map((w): [string, string] => [w.id, w.name])),
		[workflows]
	);

	return (
		<CalendarContent
			defaultAgentId={scope?.agentId}
			defaultView={scope ? "agenda" : undefined}
			emptyDescription={
				scope
					? `Schedule ${scope.agentName ?? "this agent"} to run automatically — create an automation to get started.`
					: undefined
			}
			emptyTitle={scope ? "No automations scheduled" : undefined}
			error={
				jobsQuery.isError || workflowsQuery.isError
					? "We couldn't load your calendar. Please try again."
					: null
			}
			jobs={jobs}
			loading={
				jobsQuery.isLoading || jobsQuery.isFetching || workflowsQuery.isFetching
			}
			onReload={async () => {
				await Promise.all([jobsQuery.refetch(), workflowsQuery.refetch()]);
			}}
			workflowNames={workflowNames}
		/>
	);
}
