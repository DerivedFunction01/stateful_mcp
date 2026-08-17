import type {
	EditorKeymapProfile,
	ExtensionInteractionContext,
	ExtensionTabRenderContext,
	MacroWorkspace,
	SettingsSchemaEntry,
	WorkspaceInputEvent,
	WorkspaceInputResult,
} from "@stateful-mcp/macro";
import { TuiDropdown } from "../ui/primitives/TuiDropdown";
import { TuiInput } from "../ui/primitives/TuiInput";
import { TuiNavigationPanel } from "../ui/primitives/TuiNavigationPanel";
import { TuiSlider } from "../ui/primitives/TuiSlider";
import { TuiToggle } from "../ui/primitives/TuiToggle";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

const ACTIONS = {
	up: "settings.navigate.up",
	down: "settings.navigate.down",
	left: "settings.navigate.left",
	right: "settings.navigate.right",
	select: "settings.select",
	back: "settings.back",
	save: "settings.save",
	reset: "settings.reset",
	reload: "settings.reload",
	commit: "settings.commit",
	cancel: "settings.cancel",
} as const;

interface SettingsController {
	readonly workspace: MacroWorkspace;
	readonly keymap?: EditorKeymapProfile;
	focusedRegion: "navigation" | "content" | "footer";
	focusedPath?: readonly string[];
	editingValue?: string;
}

export function createSettingsTabProvider(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
) {
	const controller: SettingsController = {
		workspace,
		keymap,
		focusedRegion: "navigation",
	};
	return {
		render: (
			context: ExtensionTabRenderContext & {
				width?: number;
				theme?: TuiThemeDefinition;
			},
		) => (
			<SettingsWindow
				controller={controller}
				width={context.width ?? 72}
				theme={context.theme}
			/>
		),
		handleAction: async (action: string): Promise<WorkspaceInputResult> =>
			handleSettingsAction(controller, action),
		handleInput: (
			event: WorkspaceInputEvent,
			context: ExtensionInteractionContext,
		) => handleSettingsInput(controller, event, context),
	};
}

async function handleSettingsAction(
	controller: SettingsController,
	action: string,
): Promise<WorkspaceInputResult> {
	const { workspace } = controller;
	const snapshot = workspace.settingsNavigation.getSnapshot();
	const entries = getSettingsEntries(workspace, controller.keymap);
	const index = Math.max(
		0,
		entries.findIndex((entry) => entry.id === snapshot.section),
	);
	if (action === ACTIONS.up || action === ACTIONS.down) {
		const delta = action === ACTIONS.down ? 1 : -1;
		const next = (index + delta + entries.length) % Math.max(1, entries.length);
		if (entries[next])
			workspace.settingsNavigation.open({ section: entries[next]!.id });
		return "handled";
	}
	if (action === ACTIONS.left) {
		controller.focusedRegion = "navigation";
		return "handled";
	}
	if (action === ACTIONS.right) {
		controller.focusedRegion = "content";
		return "handled";
	}
	if (action === ACTIONS.back) {
		workspace.layout.setFocusedPane("main");
		return "handled";
	}
	if (action === ACTIONS.select) {
		if (controller.focusedRegion === "navigation")
			controller.focusedRegion = "content";
		else if (controller.focusedRegion === "content") {
			const field = workspace.settingsContributions.get(
				snapshot.section ?? "all",
			)?.normalizedSchema[0];
			if (field) {
				controller.focusedPath = field.path;
				controller.editingValue = String(
					workspace.settings?.getPath(field.path) ?? "",
				);
				workspace.editor.setMode("INSERT");
			}
		} else controller.focusedRegion = "navigation";
		return "handled";
	}
	if (action === ACTIONS.save) {
		await workspace.commands.executeCommand("workspace.saveActive");
		return "handled";
	}
	if (action === ACTIONS.reset) {
		await workspace.settings?.reset();
		return "handled";
	}
	if (action === ACTIONS.reload) {
		await workspace.settings?.reload();
		return "handled";
	}
	if (action === ACTIONS.commit) {
		commitSetting(controller);
		controller.focusedPath = undefined;
		controller.editingValue = undefined;
		workspace.editor.setMode("NORMAL");
		return "handled";
	}
	if (action === ACTIONS.cancel) {
		controller.focusedPath = undefined;
		controller.editingValue = undefined;
		workspace.editor.setMode("NORMAL");
		return "handled";
	}
	return "ignored";
}

function handleSettingsInput(
	controller: SettingsController,
	event: WorkspaceInputEvent,
	context?: ExtensionInteractionContext,
): WorkspaceInputResult {
	const mode = context?.mode;
	if (mode !== "INSERT" || !controller.focusedPath) return "ignored";
	if (event.key === "backspace" || event.input === "\b") {
		controller.editingValue = (controller.editingValue ?? "").slice(0, -1);
	} else if (
		event.input &&
		!event.ctrl &&
		!event.meta &&
		event.input.length === 1
	) {
		controller.editingValue = (controller.editingValue ?? "") + event.input;
	} else {
		return "ignored";
	}
	return "handled";
}

function commitSetting(controller: SettingsController): void {
	if (!controller.focusedPath) return;
	const section =
		controller.workspace.settingsNavigation.getSnapshot().section ?? "all";
	const field = controller.workspace.settingsContributions
		.get(section)
		?.normalizedSchema.find(
			(entry) => entry.path.join(".") === controller.focusedPath?.join("."),
		);
	if (!field) return;
	const raw = controller.editingValue ?? "";
	const value =
		field.type === "number"
			? Number(raw)
			: field.type === "boolean"
				? raw === "true"
				: field.type === "json" || field.type === "keymap"
					? parseJsonOrString(raw)
					: raw;
	controller.workspace.settings?.setPath(field.path, value);
}

function parseJsonOrString(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function getSettingsEntries(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
) {
	return [
		{
			id: "theme",
			title: "Appearance",
			description: "Theme and terminal presentation",
		},
		{
			id: "locale",
			title: "Locale",
			description: workspace.profile?.locale ?? "en",
		},
		{
			id: "dateTime",
			title: "Date and time",
			description: "Display and parse formats",
		},
		{
			id: "keymap",
			title: "Keymap",
			description: keymap?.profileId ?? "default",
		},
		{
			id: "raw",
			title: "Raw configuration",
			description: "Inspect profile JSON",
		},
		...workspace.settingsContributions.list().map((entry) => ({
			id: entry.namespace,
			title: entry.title,
			description: `${entry.schema.length} setting${entry.schema.length === 1 ? "" : "s"}`,
		})),
	];
}

function SettingsWindow({
	controller,
	width,
	theme,
}: {
	controller: SettingsController;
	width: number;
	theme?: TuiThemeDefinition;
}) {
	const { workspace } = controller;
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();
	const entries = getSettingsEntries(workspace, controller.keymap);
	const selectedId = workspace.settingsNavigation.getSnapshot().section;
	const selectedIndex = Math.max(
		0,
		entries.findIndex((entry) => entry.id === selectedId),
	);
	const selected = entries[selectedIndex];
	const contribution = selected
		? workspace.settingsContributions.get(selected.id)
		: undefined;
	const schema = contribution?.normalizedSchema ?? [];
	const settings = workspace.settings;
	const diagnostics = settings?.getDiagnostics() ?? [];
	const setValue = (entry: SettingsSchemaEntry, value: unknown) =>
		settings?.setPath(entry.path, value);
	return (
		<TuiNavigationPanel
			title="Settings"
			items={entries.map((entry) => ({
				id: entry.id,
				title: entry.title,
				description: entry.description,
			}))}
			selectedIndex={selectedIndex}
			focusedRegion={controller.focusedRegion}
			width={width}
			theme={activeTheme}
			onHighlightChange={(index) => {
				const entry = entries[index];
				if (entry) workspace.settingsNavigation.open({ section: entry.id });
			}}
			onSelect={(_id, index) => {
				const entry = entries[index];
				if (entry) workspace.settingsNavigation.open({ section: entry.id });
			}}
			content={
				<box flexDirection="column">
					<text fg={activeTheme.colors.fgPrimary}>
						{selected?.title ?? "Settings"}
					</text>
					{contribution?.description && (
						<text fg={activeTheme.colors.fgMuted}>
							{contribution.description}
						</text>
					)}
					{schema.length === 0 ? (
						<text fg={activeTheme.colors.fgMuted}>
							No schema fields in this section.
						</text>
					) : (
						schema.map((entry) => {
							const value = settings?.getPath(entry.path);
							const diagnostic = diagnostics.find(
								(item) => item.path?.join(".") === entry.path.join("."),
							);
							const focused = controller.focusedRegion === "content";
							if (entry.type === "boolean")
								return (
									<box
										key={entry.path.join(".")}
										onMouseDown={() => setValue(entry, value !== true)}
									>
										<TuiToggle
											label={entry.title}
											checked={value === true}
											isFocused={focused}
											description={diagnostic?.message ?? entry.description}
											theme={activeTheme}
										/>
									</box>
								);
							if (entry.type === "enum")
								return (
									<TuiDropdown
										key={entry.path.join(".")}
										label={entry.title}
										selectedId={String(value ?? "")}
										options={(entry.enumValues ?? []).map((item) => ({
											id: item,
											label: item,
										}))}
										isFocused={focused}
										width={Math.max(24, width - 34)}
										theme={activeTheme}
										onSelect={(next) => setValue(entry, next)}
									/>
								);
							if (
								entry.type === "number" &&
								entry.min !== undefined &&
								entry.max !== undefined
							)
								return (
									<TuiSlider
										key={entry.path.join(".")}
										label={entry.title}
										value={typeof value === "number" ? value : entry.min}
										min={entry.min}
										max={entry.max}
										isFocused={focused}
										theme={activeTheme}
										onChange={(next) => setValue(entry, next)}
									/>
								);
							return (
								<TuiInput
									key={entry.path.join(".")}
									label={entry.title}
									value={
										focused &&
										controller.focusedPath?.join(".") === entry.path.join(".")
											? (controller.editingValue ?? "")
											: value === undefined
												? ""
												: JSON.stringify(value)
									}
									hint={diagnostic?.message ?? entry.description}
									intent={diagnostic ? "error" : "default"}
									isFocused={focused}
									width={Math.max(24, width - 34)}
									theme={activeTheme}
								/>
							);
						})
					)}
				</box>
			}
			footer={
				<box flexDirection="column">
					<text
						fg={
							diagnostics.length
								? activeTheme.colors.statusError
								: activeTheme.colors.fgMuted
						}
					>
						{diagnostics.length
							? `${diagnostics.length} validation issue${diagnostics.length === 1 ? "" : "s"}`
							: settings?.isDirty()
								? "Unsaved changes"
								: "Saved"}
					</text>
					<text fg={activeTheme.colors.fgDim}>
						Ctrl+S save · Ctrl+Shift+R reset · Esc editor
					</text>
				</box>
			}
		/>
	);
}
