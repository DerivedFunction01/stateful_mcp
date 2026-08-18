import { TextAttributes } from "@opentui/core";
import {
	type EditorKeymapProfile,
	type ExtensionInteractionContext,
	type ExtensionTabProvider,
	type ExtensionTabRenderContext,
	type I18nKernel,
	type MacroWorkspace,
	type SettingsScope,
	type SettingsUiItem,
	SettingsUiModel,
	type WorkspaceInputEvent,
	type WorkspaceInputResult,
	WorkspaceSettingsService,
} from "@stateful-mcp/macro";
import { useEffect, useReducer } from "react";
import {
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
} from "../config/default-settings";
import { translate } from "../locales";
import { TuiCursor } from "../ui/primitives/TuiCursor";
import { TuiDropdown } from "../ui/primitives/TuiDropdown";
import { TuiInput } from "../ui/primitives/TuiInput";
import { TuiTabs } from "../ui/primitives/TuiTabs";
import { TuiToggle } from "../ui/primitives/TuiToggle";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export interface SettingsWindowProps {
	readonly model: SettingsUiModel;
	readonly availableProfiles?: readonly string[];
	readonly width?: number;
	readonly height?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly focusedRegion?: "navigation" | "content" | "search";
	readonly selectedCategoryId?: string;
	readonly selectedItemIndex?: number;
	readonly onSelectCategory?: (categoryId: string) => void;
	readonly onOpenJson?: () => void;
	readonly onSwitchProfile?: (profileId: string) => void;
	readonly onCreateProfile?: () => void;
}

export function SettingsWindowView({
	model,
	availableProfiles,
	width = 100,
	theme,
	i18n,
	focusedRegion = "content",
	selectedCategoryId,
	selectedItemIndex = 0,
	onSelectCategory,
	onOpenJson,
	onSwitchProfile,
	onCreateProfile,
}: SettingsWindowProps) {
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();
	const c = activeTheme.colors;
	const snapshot = model.getSnapshot();
	const effectivePlaceholder = translate(
		i18n,
		"settings.searchPlaceholder",
		"Search settings (e.g. 'decimal', 'unit')",
	);

	// Force update on model state change
	const [, forceUpdate] = useReducer((x) => x + 1, 0);
	useEffect(() => {
		return model.subscribe(forceUpdate);
	}, [model]);

	const activeCatId =
		selectedCategoryId ?? snapshot.sections[0]?.id ?? "syntax";
	const currentSection =
		snapshot.sections.find((s) => s.id === activeCatId) ?? snapshot.sections[0];

	const isNarrow = width !== undefined && width < 70;
	const sidebarWidth = isNarrow ? 20 : 24;

	const scopes: Array<{ id: SettingsScope; label: string }> = [
		{ id: "user", label: translate(i18n, "settings.scope.user", "User") },
		{
			id: "workspace",
			label: translate(i18n, "settings.scope.workspace", "Workspace"),
		},
		{ id: "folder", label: translate(i18n, "settings.scope.folder", "Folder") },
	];

	// Build profile options dynamically from availableProfiles with ZERO hardcoded names
	const profileList =
		availableProfiles && availableProfiles.length > 0
			? availableProfiles
			: [snapshot.activeProfileId];

	const profileOptions = [
		...profileList.map((pId) => ({
			id: pId,
			label:
				pId === "base"
					? translate(i18n, "settings.profile.base", "Base (Default)")
					: pId,
			meta: pId === snapshot.activeProfileId ? "active" : undefined,
		})),
		{ id: "div-new", label: "", divider: true },
		{
			id: "create-new",
			label: translate(
				i18n,
				"settings.profile.createNew",
				"+ Create New Profile…",
			),
			meta: "Action",
		},
	];

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			width={width}
			backgroundColor={c.bgCanvas}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* 1. Header Toolbar: Search + Profile Switcher Dropdown + Scope Tabs + JSON Toggle */}
			<box
				flexDirection="row"
				alignItems="center"
				borderStyle="single"
				borderColor={
					focusedRegion === "search" ? c.borderActive : c.borderDefault
				}
				backgroundColor={c.bgSurface}
				paddingLeft={1}
				paddingRight={1}
				height={3}
				marginBottom={1}
			>
				<text
					fg={focusedRegion === "search" ? c.accentPrimary : c.fgMuted}
					attributes={TextAttributes.BOLD}
				>
					{translate(i18n, "settings.findPrompt", "Find:")}{" "}
				</text>
				{snapshot.searchQuery.length > 0 ? (
					<box flexDirection="row">
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{snapshot.searchQuery}
						</text>
						{focusedRegion === "search" && (
							<TuiCursor
								char=" "
								theme={theme ?? GlobalThemeRegistry.getActive()}
							/>
						)}
					</box>
				) : (
					<box flexDirection="row">
						{focusedRegion === "search" ? (
							<>
								<TuiCursor
									char={effectivePlaceholder.slice(0, 1)}
									isPlaceholder={true}
									theme={theme ?? GlobalThemeRegistry.getActive()}
								/>
								<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
									{effectivePlaceholder.slice(1)}
								</text>
							</>
						) : (
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								{effectivePlaceholder}
							</text>
						)}
					</box>
				)}
				<box flexGrow={1} />

				{/* Profile Switcher Dropdown */}
				<box marginRight={1}>
					<TuiDropdown
						label={translate(i18n, "settings.profileLabel", "Profile")}
						options={profileOptions}
						selectedId={snapshot.activeProfileId}
						onSelect={(id) => {
							if (id === "create-new") {
								onSwitchProfile?.("custom-profile");
							} else {
								onSwitchProfile?.(id);
							}
						}}
						width={26}
						theme={theme}
					/>
				</box>

				{/* JSON Tab Open Action Button */}
				<box
					backgroundColor={
						snapshot.isSplitJsonMode ? c.accentPrimary : c.bgElevated
					}
					paddingLeft={1}
					paddingRight={1}
					onMouseDown={() => onOpenJson?.()}
				>
					<text
						fg={snapshot.isSplitJsonMode ? c.bgCanvas : c.fgPrimary}
						attributes={TextAttributes.BOLD}
					>
						{"{ }"}
					</text>
				</box>
			</box>

			{/* 2. Scope Bar */}
			<box height={1} marginBottom={1} flexDirection="row" alignItems="center">
				<TuiTabs
					tabs={scopes}
					activeTabId={snapshot.activeScope}
					theme={theme}
				/>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{snapshot.totalModifiedCount > 0
						? translate(
								i18n,
								"settings.filter.modified",
								`Modified (${snapshot.totalModifiedCount})`,
								{
									count: snapshot.totalModifiedCount,
								},
							)
						: translate(
								i18n,
								"settings.origin.inherited",
								"Inherited from Base",
							)}
				</text>
			</box>

			{/* 3. Main Two-Column Stage */}
			<box flexDirection="row" flexGrow={1}>
				{/* Left Category Navigation Sidebar */}
				<box
					width={sidebarWidth}
					flexDirection="column"
					paddingRight={1}
					borderStyle="single"
					borderColor={
						focusedRegion === "navigation" ? c.borderActive : c.borderSubtle
					}
				>
					{snapshot.sections.map((sec) => {
						const isSelected = sec.id === activeCatId;
						return (
							<box
								key={sec.id}
								height={1}
								flexDirection="row"
								backgroundColor={isSelected ? c.bgActive : undefined}
								paddingLeft={1}
								onMouseDown={() => onSelectCategory?.(sec.id)}
							>
								<text
									fg={isSelected ? c.accentPrimary : c.fgSecondary}
									attributes={isSelected ? TextAttributes.BOLD : 0}
								>
									› {sec.title}
								</text>
							</box>
						);
					})}
				</box>

				{/* Right Main Content Panel */}
				<box flexDirection="column" paddingLeft={2} flexGrow={1}>
					{currentSection && (
						<box flexDirection="column">
							{/* Category Title Header */}
							<box height={2} flexDirection="column" marginBottom={1}>
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									{currentSection.title}
								</text>
								<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
									{`Configure ${currentSection.title.toLowerCase()} preferences and overrides.`}
								</text>
							</box>

							{/* Setting Item Cards */}
							{currentSection.items.map((item, itemIdx) => {
								const isFocused =
									focusedRegion === "content" && itemIdx === selectedItemIndex;

								return (
									<SettingItemRow
										key={item.schema.path.join(".")}
										item={item}
										isFocused={isFocused}
										theme={activeTheme}
										i18n={i18n}
										width={width - sidebarWidth - 6}
										onReset={() => model.resetValue(item.schema.path)}
										onChange={(val) => model.setValue(item.schema.path, val)}
									/>
								);
							})}
						</box>
					)}
				</box>
			</box>
		</box>
	);
}

interface SettingItemRowProps {
	readonly item: SettingsUiItem;
	readonly isFocused: boolean;
	readonly theme: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly width: number;
	readonly onReset: () => void;
	readonly onChange: (val: unknown) => void;
}

function SettingItemRow({
	item,
	isFocused,
	theme,
	i18n,
	width,
	onReset,
	onChange,
}: SettingItemRowProps) {
	const c = theme.colors;
	const s = item.schema;

	const originBadge =
		item.origin.kind === "overridden"
			? `[Overridden in ${item.origin.sourceProfileId}]`
			: item.origin.kind === "appended"
				? `[Appended (+${item.origin.appendedCount ?? 2})]`
				: `[Default]`;

	const originColor =
		item.origin.kind === "overridden"
			? c.accentPeach
			: item.origin.kind === "appended"
				? c.accentSecondary
				: c.fgDim;

	return (
		<box
			flexDirection="column"
			marginBottom={1}
			backgroundColor={isFocused ? c.bgElevated : undefined}
			padding={isFocused ? 1 : 0}
		>
			<box flexDirection="row" alignItems="center">
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{s.title}:{" "}
				</text>
				<box flexGrow={1} />
				{/* Clean Text Origin Attribution Badge */}
				<text fg={originColor} attributes={TextAttributes.DIM}>
					{originBadge}
				</text>
			</box>

			{s.description && (
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{s.description}
				</text>
			)}

			<box marginTop={0}>
				{s.type === "enum" && s.enumValues ? (
					<TuiDropdown
						label=""
						selectedId={String(item.value ?? "")}
						options={s.enumValues.map((v) => ({ id: v, label: v }))}
						onSelect={onChange}
						isFocused={isFocused}
						width={Math.min(32, width)}
						theme={theme}
					/>
				) : s.type === "boolean" ? (
					<TuiToggle
						label=""
						checked={Boolean(item.value)}
						isFocused={isFocused}
						theme={theme}
					/>
				) : (
					<TuiInput
						label=""
						value={String(item.value ?? "")}
						isFocused={isFocused}
						width={Math.min(36, width)}
						theme={theme}
					/>
				)}
			</box>
		</box>
	);
}

export function createSettingsTabProvider(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
): ExtensionTabProvider {
	const defaultService = new WorkspaceSettingsService({
		defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
		schema: getDefaultSettingsSchema(workspace.i18n),
		storage: {
			read: () => null,
			write: () => {},
			reset: () => {},
		},
	});

	const service = workspace.settings ?? defaultService;
	const uiModel = new SettingsUiModel(service);
	let focusedRegion: "navigation" | "content" | "search" = "navigation";
	let selectedCategoryIndex = 0;
	let selectedItemIndex = 0;

	const SECTIONS = ["theme", "locale", "dateTime", "keymap", "raw"] as const;

	function syncNavigationState(): void {
		const currentSecId = SECTIONS[selectedCategoryIndex] ?? "theme";
		workspace.settingsNavigation.open({ section: currentSecId });
	}

	function navigateDown(): void {
		if (focusedRegion === "navigation") {
			selectedCategoryIndex = (selectedCategoryIndex + 1) % SECTIONS.length;
			selectedItemIndex = 0;
			syncNavigationState();
		} else {
			const snapshot = uiModel.getSnapshot();
			const currentSection = snapshot.sections[selectedCategoryIndex];
			if (currentSection) {
				selectedItemIndex = Math.min(
					currentSection.items.length - 1,
					selectedItemIndex + 1,
				);
			}
		}
	}

	function navigateUp(): void {
		if (focusedRegion === "navigation") {
			selectedCategoryIndex =
				(selectedCategoryIndex - 1 + SECTIONS.length) % SECTIONS.length;
			selectedItemIndex = 0;
			syncNavigationState();
		} else {
			selectedItemIndex = Math.max(0, selectedItemIndex - 1);
		}
	}

	// Register workbench commands for settings navigation
	workspace.commands.registerCommand(
		{
			command: "settings.navigate.down",
			title: "Settings: Navigate Down",
			category: "Preferences",
		},
		{ execute: () => navigateDown() },
	);
	workspace.commands.registerCommand(
		{
			command: "settings.navigate.up",
			title: "Settings: Navigate Up",
			category: "Preferences",
		},
		{ execute: () => navigateUp() },
	);
	workspace.commands.registerCommand(
		{
			command: "settings.navigate.left",
			title: "Settings: Focus Navigation",
			category: "Preferences",
		},
		{
			execute: () => {
				focusedRegion = "navigation";
			},
		},
	);
	workspace.commands.registerCommand(
		{
			command: "settings.navigate.right",
			title: "Settings: Focus Content",
			category: "Preferences",
		},
		{
			execute: () => {
				focusedRegion = "content";
			},
		},
	);
	workspace.commands.registerCommand(
		{
			command: "settings.select",
			title: "Settings: Select / Toggle",
			category: "Preferences",
		},
		{
			execute: () => {
				// Toggle or cycle value on current item
			},
		},
	);
	workspace.commands.registerCommand(
		{
			command: "settings.back",
			title: "Settings: Back to Editor",
			category: "Preferences",
		},
		{
			execute: () => {
				workspace.layout.setActiveTab("scratchpad");
			},
		},
	);
	workspace.commands.registerCommand(
		{
			command: "settings.save",
			title: "Settings: Save",
			category: "Preferences",
		},
		{ execute: () => service.save() },
	);

	return {
		render(context: ExtensionTabRenderContext) {
			const snapshot = uiModel.getSnapshot();
			const selectedCatId = snapshot.sections[selectedCategoryIndex]?.id;

			return (
				<SettingsWindowView
					model={uiModel}
					i18n={workspace.i18n}
					focusedRegion={focusedRegion}
					selectedCategoryId={selectedCatId}
					selectedItemIndex={selectedItemIndex}
					onOpenJson={() => {
						void workspace.commands.executeCommand(
							"workbench.action.openSettingsJson",
						);
					}}
				/>
			);
		},

		handleAction(
			actionId: string,
			payload: unknown,
			context: ExtensionInteractionContext,
		): WorkspaceInputResult {
			switch (actionId) {
				case "settings.navigate.down":
					navigateDown();
					return "handled";
				case "settings.navigate.up":
					navigateUp();
					return "handled";
				case "settings.navigate.left":
					focusedRegion = "navigation";
					return "handled";
				case "settings.navigate.right":
					focusedRegion = "content";
					return "handled";
				case "settings.select":
					return "handled";
				case "settings.search":
					focusedRegion = "search";
					return "handled";
				case "settings.back":
					workspace.layout.setActiveTab("scratchpad");
					return "handled";
				case "settings.save":
					void service.save();
					return "handled";
				default:
					return "ignored";
			}
		},

		handleInput(
			event: WorkspaceInputEvent,
			context: ExtensionInteractionContext,
		): WorkspaceInputResult {
			const snapshot = uiModel.getSnapshot();

			// 1. Mouse Interaction
			if (event.type === "pointer" && event.action === "press") {
				// Handle mouse clicks on categories vs content
				if (event.x !== undefined && event.x < 30) {
					focusedRegion = "navigation";
					if (event.y !== undefined && event.y >= 5) {
						const catIdx = Math.min(
							snapshot.sections.length - 1,
							Math.max(0, event.y - 5),
						);
						selectedCategoryIndex = catIdx;
						selectedItemIndex = 0;
						syncNavigationState();
					}
					return "handled";
				}
				focusedRegion = "content";
				return "handled";
			}

			if (event.type === "wheel") {
				const delta = event.delta ?? 1;
				if (delta > 0) {
					navigateDown();
				} else {
					navigateUp();
				}
				return "handled";
			}

			// 2. Keyboard Navigation
			const key = (event.key || event.input || "").toLowerCase();

			// If search region is focused, capture text input like command palette
			if (focusedRegion === "search") {
				if (
					key === "escape" ||
					key === "enter" ||
					key === "tab" ||
					key === "\t"
				) {
					focusedRegion = "content";
					return "handled";
				}
				if (key === "backspace" || key === "\b" || key === "\x7f") {
					uiModel.setSearchQuery(snapshot.searchQuery.slice(0, -1));
					return "handled";
				}
				if (
					event.input &&
					!event.ctrl &&
					!event.meta &&
					event.input.length === 1
				) {
					uiModel.setSearchQuery(snapshot.searchQuery + event.input);
					return "handled";
				}
				return "handled";
			}

			// Trigger search with '/'
			if (key === "/") {
				focusedRegion = "search";
				return "handled";
			}

			if (key === "tab" || key === "\t") {
				focusedRegion =
					focusedRegion === "navigation" ? "content" : "navigation";
				return "handled";
			}

			if (key === "j" || key === "down") {
				navigateDown();
				return "handled";
			}

			if (key === "k" || key === "up") {
				navigateUp();
				return "handled";
			}

			if (key === "h" || key === "left") {
				focusedRegion = "navigation";
				return "handled";
			}

			if (key === "l" || key === "right") {
				focusedRegion = "content";
				return "handled";
			}

			if (key === "enter") {
				return "handled";
			}

			if (key === "escape") {
				if (focusedRegion === "navigation") {
					workspace.layout.setActiveTab("scratchpad");
					return "handled";
				}
				focusedRegion = "navigation";
				return "handled";
			}

			if (key === "s" && event.ctrl) {
				void service.save();
				return "handled";
			}

			return "ignored";
		},
	};
}
