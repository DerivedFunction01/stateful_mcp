import type {
	EditorKeymapProfile,
	ExtensionInteractionContext,
	ExtensionTabRenderContext,
	MacroWorkspace,
	SettingsSchemaEntry,
	WorkspaceInputEvent,
	WorkspaceInputResult,
} from "@stateful-mcp/macro";
import { useSyncExternalStore } from "react";
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
	focusedFieldIndex: number;
	focusedPath?: readonly string[];
	editingValue?: string;
	version: number;
	notify: () => void;
	subscribe: (listener: () => void) => () => void;
}

const CORE_SCHEMAS: Record<string, readonly SettingsSchemaEntry[]> = {
	theme: [
		{
			path: ["theme"],
			type: "enum",
			title: "Color Theme",
			description: "Active color palette for the terminal UI",
			enumValues: [
				"github-dark",
				"github-light",
				"opencode-dark",
				"monokai",
				"nord",
			],
		},
	],
	locale: [
		{
			path: ["locale"],
			type: "enum",
			title: "Language & Locale",
			description: "Interface translations and formatting defaults",
			enumValues: ["en", "es"],
		},
	],
	dateTime: [
		{
			path: ["dateTime", "format"],
			type: "enum",
			title: "Date Presentation Format",
			description: "Timestamp and date layout representation",
			enumValues: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"],
		},
	],
	keymap: [
		{
			path: ["keymap"],
			type: "enum",
			title: "Editor Keymap",
			description: "Active modal keybindings profile",
			enumValues: ["default", "vim", "emacs"],
		},
	],
	raw: [
		{
			path: ["raw"],
			type: "string",
			title: "Raw Profile JSON",
			description: "Underlying configuration document",
		},
	],
};

export function createSettingsTabProvider(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
) {
	const listeners = new Set<() => void>();
	const controller: SettingsController = {
		workspace,
		keymap,
		focusedRegion: "navigation",
		focusedFieldIndex: 0,
		version: 0,
		notify: () => {
			controller.version++;
			for (const listener of listeners) {
				try {
					listener();
				} catch {}
			}
			workspace.settingsNavigation.open();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return {
		render: (
			context: ExtensionTabRenderContext & {
				width?: number;
				height?: number;
				theme?: TuiThemeDefinition;
			},
		) => (
			<SettingsWindow
				controller={controller}
				width={context.width ?? 64}
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

function getSectionSchema(
	workspace: MacroWorkspace,
	sectionId: string | undefined,
): readonly SettingsSchemaEntry[] {
	const section = sectionId ?? "theme";
	const contribution = workspace.settingsContributions.get(section);
	if (contribution && contribution.normalizedSchema.length > 0) {
		return contribution.normalizedSchema;
	}
	return CORE_SCHEMAS[section] ?? [];
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
	const currentSection = entries[index]?.id ?? "theme";
	const schema = getSectionSchema(workspace, currentSection);

	if (action === ACTIONS.up || action === ACTIONS.down) {
		const delta = action === ACTIONS.down ? 1 : -1;
		if (controller.focusedRegion === "navigation") {
			const next =
				(index + delta + entries.length) % Math.max(1, entries.length);
			if (entries[next]) {
				workspace.settingsNavigation.open({ section: entries[next]!.id });
				controller.focusedFieldIndex = 0;
				controller.focusedPath = undefined;
				controller.editingValue = undefined;
			}
			controller.notify();
			return "handled";
		}
		if (controller.focusedRegion === "content") {
			if (schema.length > 0) {
				const nextIndex =
					(controller.focusedFieldIndex + delta + schema.length) %
					schema.length;
				controller.focusedFieldIndex = nextIndex;
				controller.focusedPath = schema[nextIndex]?.path;
				controller.editingValue = undefined;
			}
			controller.notify();
			return "handled";
		}
		if (controller.focusedRegion === "footer") {
			controller.focusedRegion = "content";
			controller.notify();
			return "handled";
		}
		return "handled";
	}

	if (action === ACTIONS.left) {
		controller.focusedRegion = "navigation";
		controller.focusedPath = undefined;
		controller.editingValue = undefined;
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.right) {
		controller.focusedRegion = "content";
		if (schema.length > 0) {
			controller.focusedFieldIndex = Math.max(
				0,
				Math.min(schema.length - 1, controller.focusedFieldIndex),
			);
			controller.focusedPath = schema[controller.focusedFieldIndex]?.path;
		}
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.select) {
		if (controller.focusedRegion === "navigation") {
			controller.focusedRegion = "content";
			if (schema.length > 0) {
				controller.focusedFieldIndex = 0;
				controller.focusedPath = schema[0]?.path;
			}
			controller.notify();
			return "handled";
		}
		if (controller.focusedRegion === "content") {
			const field = schema[controller.focusedFieldIndex];
			if (field) {
				const value = workspace.settings?.getPath(field.path);
				if (field.type === "boolean") {
					workspace.settings?.setPath(field.path, value !== true);
				} else if (field.type === "enum") {
					const values = field.enumValues ?? [];
					if (values.length > 0) {
						const current = String(value ?? values[0]);
						const currentIndex = values.indexOf(current);
						const nextIndex = (Math.max(0, currentIndex) + 1) % values.length;
						workspace.settings?.setPath(field.path, values[nextIndex]);
					}
				} else if (
					field.type === "number" &&
					field.min !== undefined &&
					field.max !== undefined
				) {
					const current = typeof value === "number" ? value : (field.min ?? 0);
					const step = Math.max(1, Math.round((field.max - field.min) / 10));
					const next =
						current >= field.max
							? field.min
							: Math.min(field.max, current + step);
					workspace.settings?.setPath(field.path, next);
				} else {
					controller.focusedPath = field.path;
					controller.editingValue =
						value === undefined
							? ""
							: typeof value === "string"
								? value
								: JSON.stringify(value);
					workspace.editor.setMode("INSERT");
				}
				controller.notify();
			}
			return "handled";
		}
		controller.focusedRegion = "navigation";
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.back) {
		if (controller.focusedRegion === "content") {
			controller.focusedRegion = "navigation";
			controller.focusedPath = undefined;
			controller.editingValue = undefined;
			controller.notify();
			return "handled";
		}
		workspace.layout.setActiveTab("scratchpad");
		workspace.layout.setFocusedPane("main");
		return "handled";
	}

	if (action === ACTIONS.save) {
		await workspace.commands.executeCommand("workspace.saveActive");
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.reset) {
		await workspace.settings?.reset();
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.reload) {
		await workspace.settings?.reload();
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.commit) {
		commitSetting(controller, schema);
		controller.focusedPath = undefined;
		controller.editingValue = undefined;
		workspace.editor.setMode("NORMAL");
		controller.notify();
		return "handled";
	}

	if (action === ACTIONS.cancel) {
		controller.focusedPath = undefined;
		controller.editingValue = undefined;
		workspace.editor.setMode("NORMAL");
		controller.notify();
		return "handled";
	}

	return "ignored";
}

function handleSettingsInput(
	controller: SettingsController,
	event: WorkspaceInputEvent,
	context?: ExtensionInteractionContext,
): WorkspaceInputResult {
	const mode = context?.mode ?? controller.workspace.editor.getMode();
	if (mode !== "INSERT" || !controller.focusedPath) return "ignored";
	if (event.key === "backspace" || event.input === "\b") {
		controller.editingValue = (controller.editingValue ?? "").slice(0, -1);
		controller.notify();
		return "handled";
	}
	if (event.input && !event.ctrl && !event.meta && event.input.length === 1) {
		controller.editingValue = (controller.editingValue ?? "") + event.input;
		controller.notify();
		return "handled";
	}
	return "ignored";
}

function commitSetting(
	controller: SettingsController,
	schema?: readonly SettingsSchemaEntry[],
): void {
	if (!controller.focusedPath) return;
	const { workspace } = controller;
	const snapshot = workspace.settingsNavigation.getSnapshot();
	const activeSchema = schema ?? getSectionSchema(workspace, snapshot.section);
	const field = activeSchema.find(
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
	workspace.settings?.setPath(field.path, value);
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
			description: "Theme and presentation",
		},
		{
			id: "locale",
			title: "Locale",
			description: workspace.profile?.locale ?? "en",
		},
		{
			id: "dateTime",
			title: "Date & Time",
			description: "Display & parse formats",
		},
		{
			id: "keymap",
			title: "Keymap",
			description: keymap?.profileId ?? "default",
		},
		{
			id: "raw",
			title: "Raw Configuration",
			description: "Profile JSON document",
		},
		...workspace.settingsContributions.list().map((entry) => ({
			id: entry.namespace,
			title: entry.title,
			description: `${entry.schema.length} setting${entry.schema.length === 1 ? "" : "s"}`,
		})),
	];
}

export function SettingsWindow({
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

	useSyncExternalStore(
		(listener) => {
			const u1 = controller.subscribe(listener);
			const u2 = workspace.settingsNavigation.subscribe(listener);
			const u3 = workspace.settings?.subscribe(listener) ?? (() => undefined);
			const u4 = workspace.editor.subscribe(listener);
			return () => {
				u1();
				u2();
				u3();
				u4();
			};
		},
		() =>
			JSON.stringify({
				version: controller.version,
				section: workspace.settingsNavigation.getSnapshot().section,
				focusedRegion: controller.focusedRegion,
				focusedFieldIndex: controller.focusedFieldIndex,
				focusedPath: controller.focusedPath,
				editingValue: controller.editingValue,
				mode: workspace.editor.getMode(),
				raw: workspace.settings?.getRawText(),
				diagnostics: workspace.settings?.getDiagnostics(),
			}),
	);

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
	const schema = getSectionSchema(workspace, selected?.id);
	const settings = workspace.settings;
	const diagnostics = settings?.getDiagnostics() ?? [];
	const setValue = (entry: SettingsSchemaEntry, value: unknown) => {
		settings?.setPath(entry.path, value);
		controller.notify();
	};

	const navigationWidth = Math.max(18, Math.min(28, Math.floor(width * 0.35)));
	const controlWidth = Math.max(20, width - navigationWidth - 10);
	const isEditorInsertMode = workspace.editor.getMode() === "INSERT";

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
				if (entry) {
					workspace.settingsNavigation.open({ section: entry.id });
					controller.focusedFieldIndex = 0;
					controller.notify();
				}
			}}
			onSelect={(_id, index) => {
				const entry = entries[index];
				if (entry) {
					workspace.settingsNavigation.open({ section: entry.id });
					controller.focusedFieldIndex = 0;
					controller.notify();
				}
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
						schema.map((entry, entryIndex) => {
							const value = settings?.getPath(entry.path);
							const diagnostic = diagnostics.find(
								(item) => item.path?.join(".") === entry.path.join("."),
							);
							const isFieldFocused =
								controller.focusedRegion === "content" &&
								controller.focusedFieldIndex === entryIndex;
							const isEditingThis =
								isFieldFocused &&
								isEditorInsertMode &&
								controller.focusedPath?.join(".") === entry.path.join(".");

							if (entry.type === "boolean")
								return (
									<box
										key={entry.path.join(".")}
										onMouseDown={() => setValue(entry, value !== true)}
									>
										<TuiToggle
											label={entry.title}
											checked={value === true}
											isFocused={isFieldFocused}
											description={
												diagnostic?.message ??
												entry.description ??
												"Enter to toggle"
											}
											theme={activeTheme}
										/>
									</box>
								);
							if (entry.type === "enum")
								return (
									<TuiDropdown
										key={entry.path.join(".")}
										label={entry.title}
										selectedId={String(value ?? entry.enumValues?.[0] ?? "")}
										options={(entry.enumValues ?? []).map((item) => ({
											id: item,
											label: item,
										}))}
										isFocused={isFieldFocused}
										width={controlWidth}
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
										value={typeof value === "number" ? value : (entry.min ?? 0)}
										min={entry.min}
										max={entry.max}
										isFocused={isFieldFocused}
										theme={activeTheme}
										onChange={(next) => setValue(entry, next)}
									/>
								);
							return (
								<TuiInput
									key={entry.path.join(".")}
									label={entry.title}
									value={
										isEditingThis
											? `${controller.editingValue ?? ""}▌`
											: value === undefined
												? ""
												: typeof value === "string"
													? value
													: JSON.stringify(value)
									}
									hint={
										isEditingThis
											? "Enter to commit · Esc to cancel"
											: (diagnostic?.message ??
												entry.description ??
												"Enter to edit")
									}
									intent={diagnostic ? "error" : "default"}
									isFocused={isFieldFocused}
									width={controlWidth}
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
						Ctrl+S save · Ctrl+Shift+R reset · Esc back
					</text>
				</box>
			}
		/>
	);
}
