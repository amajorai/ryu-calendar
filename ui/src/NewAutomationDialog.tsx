import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	ModelAgentPicker,
	type RyuPickerSelection,
} from "@ryu/blocks/composer/runtime-picker";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useEffect, useState } from "react";
import { createScheduledAgentWorkflow, fetchRuntimeCatalog } from "./bridge.ts";
import { phraseToSchedule, type SchedulePhrase } from "./lib/automations.ts";

const PHRASE_OPTIONS: { value: SchedulePhrase; label: string }[] = [
	{ value: "hourly", label: "Every hour" },
	{ value: "daily", label: "Daily" },
	{ value: "weekdays", label: "Weekdays" },
	{ value: "weekends", label: "Weekends" },
	{ value: "weekly", label: "Weekly" },
	{ value: "everyminute", label: "Every minute" },
	{ value: "custom", label: "Custom cron" },
];

const WEEKDAY_OPTIONS = [
	{ value: "monday", label: "Monday" },
	{ value: "tuesday", label: "Tuesday" },
	{ value: "wednesday", label: "Wednesday" },
	{ value: "thursday", label: "Thursday" },
	{ value: "friday", label: "Friday" },
	{ value: "saturday", label: "Saturday" },
	{ value: "sunday", label: "Sunday" },
];

export function NewAutomationDialog({
	open,
	onOpenChange,
	onCreated,
	defaultAgentId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
	defaultAgentId?: string;
}) {
	// The schedule mutation remains on the calendar domain bridge, while the picker
	// reads the same Ryu-owned runtime catalog as every other Companion app.
	const { data: runtimeCatalog } = useQuery<RyuCatalogSnapshot>({
		queryKey: ["calendar-runtime-catalog"],
		queryFn: () => fetchRuntimeCatalog(),
	});

	const [agentSelection, setAgentSelection] = useState<
		RyuPickerSelection | undefined
	>(() =>
		defaultAgentId ? { agentId: defaultAgentId, kind: "agent" } : undefined
	);
	const [phrase, setPhrase] = useState<SchedulePhrase>("daily");
	const [dailyTime, setDailyTime] = useState("09:00");
	const [weeklyDay, setWeeklyDay] = useState("monday");
	const [weeklyTime, setWeeklyTime] = useState("09:00");
	const [customCron, setCustomCron] = useState("");
	const [requireApproval, setRequireApproval] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (agentSelection || defaultAgentId || !runtimeCatalog?.agents[0]) {
			return;
		}
		setAgentSelection({ agentId: runtimeCatalog.agents[0].id, kind: "agent" });
	}, [agentSelection, defaultAgentId, runtimeCatalog]);

	const selectedAgentId =
		agentSelection?.kind === "agent"
			? agentSelection.agentId
			: (defaultAgentId ?? runtimeCatalog?.agents[0]?.id ?? "");

	const handleCreate = async () => {
		const catalogAgent = runtimeCatalog?.agents.find(
			(agent) => agent.id === selectedAgentId
		);
		const agentName = catalogAgent?.name;
		if (!(selectedAgentId && agentName)) {
			setError("Pick an agent to schedule.");
			return;
		}
		if (phrase === "custom" && customCron.trim().length === 0) {
			setError("Enter a cron expression.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			// The target is inert in the sandbox (the host owns the node token); the
			// bridge runs the composite host-side.
			await createScheduledAgentWorkflow(undefined, {
				agentId: selectedAgentId,
				agentName,
				schedule: phraseToSchedule(
					phrase,
					dailyTime,
					weeklyDay,
					weeklyTime,
					customCron
				),
				requireApproval,
			});
			onCreated();
			onOpenChange(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create automation");
		} finally {
			setSaving(false);
		}
	};

	const showDailyTime =
		phrase === "daily" || phrase === "weekdays" || phrase === "weekends";

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New automation</DialogTitle>
					<DialogDescription>
						Run an agent automatically on a durable routine. Its result appears
						in the agent's routine and run-history views.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-1">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="automation-agent">Agent</Label>
						<ModelAgentPicker
							ariaLabel="Choose the agent to schedule"
							catalog={runtimeCatalog ?? null}
							mode="agent"
							onSelectionChange={setAgentSelection}
							placeholder="Choose an agent"
							value={agentSelection}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="automation-schedule">Schedule</Label>
						<NativeSelect
							className="w-full"
							id="automation-schedule"
							onChange={(e) => setPhrase(e.target.value as SchedulePhrase)}
							value={phrase}
						>
							{PHRASE_OPTIONS.map((o) => (
								<NativeSelectOption key={o.value} value={o.value}>
									{o.label}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</div>

					{showDailyTime && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="automation-daily-time">Time (UTC)</Label>
							<Input
								id="automation-daily-time"
								onChange={(e) => setDailyTime(e.target.value)}
								type="time"
								value={dailyTime}
							/>
						</div>
					)}

					{phrase === "weekly" && (
						<div className="flex gap-3">
							<div className="flex flex-1 flex-col gap-1.5">
								<Label htmlFor="automation-weekly-day">Day</Label>
								<NativeSelect
									className="w-full"
									id="automation-weekly-day"
									onChange={(e) => setWeeklyDay(e.target.value)}
									value={weeklyDay}
								>
									{WEEKDAY_OPTIONS.map((o) => (
										<NativeSelectOption key={o.value} value={o.value}>
											{o.label}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</div>
							<div className="flex flex-1 flex-col gap-1.5">
								<Label htmlFor="automation-weekly-time">Time (UTC)</Label>
								<Input
									id="automation-weekly-time"
									onChange={(e) => setWeeklyTime(e.target.value)}
									type="time"
									value={weeklyTime}
								/>
							</div>
						</div>
					)}

					{phrase === "custom" && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="automation-cron">Cron expression (UTC)</Label>
							<Input
								id="automation-cron"
								onChange={(e) => setCustomCron(e.target.value)}
								placeholder="0 9 * * *"
								value={customCron}
							/>
						</div>
					)}

					<div className="flex items-start justify-between gap-3 rounded-lg border p-3">
						<div className="flex flex-col gap-0.5">
							<Label htmlFor="automation-require-approval">
								Require my approval
							</Label>
							<p className="text-muted-foreground text-xs">
								Each run waits in your Approvals inbox until you allow it,
								instead of running on its own.
							</p>
						</div>
						<Switch
							checked={requireApproval}
							id="automation-require-approval"
							onCheckedChange={setRequireApproval}
						/>
					</div>

					{error && <p className="text-destructive text-sm">{error}</p>}
				</div>

				<DialogFooter>
					<Button
						disabled={saving}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={saving || !runtimeCatalog?.agents.length}
						onClick={() => {
							handleCreate().catch(() => undefined);
						}}
					>
						{saving ? "Creating…" : "Create automation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
