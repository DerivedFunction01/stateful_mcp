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
import { TuiColorPicker } from "../ui/primitives/TuiColorPicker";
import { TuiCursor } from "../ui/primitives/TuiCursor";
import {
	TuiDatePicker,
	type TuiDatePickerDate,
} from "../ui/primitives/TuiDatePicker";
import { TuiDropdown } from "../ui/primitives/TuiDropdown";
import { TuiInput } from "../ui/primitives/TuiInput";
import { TuiSlider } from "../ui/primitives/TuiSlider";
import { TuiTable } from "../ui/primitives/TuiTable";
import { TuiTabs } from "../ui/primitives/TuiTabs";
import { TuiTagInput } from "../ui/primitives/TuiTagInput";
import { TuiToggle } from "../ui/primitives/TuiToggle";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

function parseTuiDate(dateStr: string): TuiDatePickerDate | undefined {
	const parts = dateStr.split("-").map((p) => parseInt(p, 10));
	if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
		return { year: parts[0], month: parts[1], day: parts[2] };
	}
	return undefined;
}

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
	const effectivePlaceholder = translate(i18n, "settings.searchPlaceholder");

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
		{ id: "user", label: translate(i18n, "settings.scope.user") },
		{
			id: "workspace",
			label: translate(i18n, "settings.scope.workspace"),
		},
		{ id: "folder", label: translate(i18n, "settings.scope.folder") },
	];

	// Build profile options dynamically from availableProfiles with ZERO hardcoded names
	const profileList =
		availableProfiles && availableProfiles.length > 0
			? availableProfiles
			: [snapshot.activeProfileId];

	const profileOptions = [
		...profileList.map((pId) => ({
			id: pId,
			label: pId === "base" ? translate(i18n, "settings.profile.base") : pId,
			meta: pId === snapshot.activeProfileId ? "active" : undefined,
		})),
		{ id: "div-new", label: "", divider: true },
		{
			id: "create-new",
			label: translate(i18n, "settings.profile.createNew"),
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
					{translate(i18n, "settings.findPrompt")}{" "}
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
						label={translate(i18n, "settings.profileLabel")}
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
						? translate(i18n, "settings.filter.modified", {
								count: snapshot.totalModifiedCount,
							})
						: translate(i18n, "settings.origin.inherited")}
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
	const widget =
		s.widget ??
		(s.type === "boolean"
			? "toggle"
			: s.type === "enum"
				? "dropdown"
				: s.type === "number" && s.min !== undefined && s.max !== undefined
					? "slider"
					: s.type === "array"
						? "tag-input"
						: "input");

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
				{widget === "slider" ? (
					<TuiSlider
						label=""
						value={typeof item.value === "number" ? item.value : (s.min ?? 0)}
						min={s.min ?? 0}
						max={s.max ?? 100}
						step={s.step ?? 1}
						isFocused={isFocused}
						theme={theme}
						i18n={i18n}
						width={Math.min(36, width)}
						onChange={(val) => onChange(val)}
					/>
				) : widget === "tag-input" ? (
					<TuiTagInput
						label=""
						tags={
							Array.isArray(item.value)
								? item.value.map((tag: unknown, i: number) => ({
										id: String(i),
										label: String(tag),
									}))
								: []
						}
						isFocused={isFocused}
						theme={theme}
						i18n={i18n}
						width={Math.min(48, width)}
						onAddTag={(newTag) => {
							const current = Array.isArray(item.value) ? [...item.value] : [];
							current.push(newTag);
							onChange(current);
						}}
						onRemoveTag={(tagId) => {
							const idx = parseInt(tagId, 10);
							if (Array.isArray(item.value) && !Number.isNaN(idx)) {
								const current = [...item.value];
								current.splice(idx, 1);
								onChange(current);
							}
						}}
					/>
				) : widget === "color-picker" ? (
					<TuiColorPicker
						label=""
						value={String(item.value ?? "#38bdf8")}
						isFocused={isFocused}
						theme={theme}
						i18n={i18n}
						width={Math.min(36, width)}
					/>
				) : widget === "date-picker" ? (
					<TuiDatePicker
						label=""
						value={parseTuiDate(String(item.value ?? ""))}
						isFocused={isFocused}
						theme={theme}
						i18n={i18n}
						width={Math.min(36, width)}
						onSelectDate={(d) =>
							onChange(
								`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
							)
						}
					/>
				) : widget === "table" ? (
					<TuiTable
						columns={[
							{ id: "key", header: "Key" },
							{ id: "value", header: "Value" },
						]}
						data={
							Array.isArray(item.value)
								? (item.value as Array<Record<string, unknown>>)
								: typeof item.value === "object" && item.value !== null
									? Object.entries(item.value).map(([k, v]) => ({
											key: k,
											value: Array.isArray(v) ? v.join(", ") : String(v),
										}))
									: []
						}
						theme={theme}
					/>
				) : widget === "dropdown" || s.type === "enum" ? (
					<TuiDropdown
						label=""
						selectedId={String(item.value ?? "")}
						options={
							s.enumOptions ??
							s.enumValues?.map((v) => ({ id: v, label: v })) ??
							[]
						}
						onSelect={onChange}
						isFocused={isFocused}
						width={Math.min(32, width)}
						theme={theme}
					/>
				) : widget === "toggle" || s.type === "boolean" ? (
					<TuiToggle
						label=""
						checked={Boolean(item.value)}
						onToggle={(c) => onChange(c)}
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
	const uiModel = new SettingsUiModel(service, workspace.i18n);
	let focusedRegion: "navigation" | "content" | "search" = "navigation";
	let selectedCategoryIndex = 0;
	let selectedItemIndex = 0;

	function getActiveSections(): readonly string[] {
		const snapshot = uiModel.getSnapshot();
		const secIds = snapshot.sections.map((s) => s.id);
		return secIds.length > 0 ? secIds : ["syntax"];
	}

	function syncNavigationState(): void {
		const sections = getActiveSections();
		const currentSecId =
			sections[selectedCategoryIndex] ?? sections[0] ?? "syntax";
		workspace.settingsNavigation?.open?.({ section: currentSecId });
	}

	function navigateDown(): void {
		const sections = getActiveSections();
		if (focusedRegion === "navigation") {
			selectedCategoryIndex = (selectedCategoryIndex + 1) % sections.length;
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
		const sections = getActiveSections();
		if (focusedRegion === "navigation") {
			selectedCategoryIndex =
				(selectedCategoryIndex - 1 + sections.length) % sections.length;
			selectedItemIndex = 0;
			syncNavigationState();
		} else {
			selectedItemIndex = Math.max(0, selectedItemIndex - 1);
		}
	}

	// Register workbench commands for settings navigation
	workspace.commands.registerCommand(
		{
			command: "settings.navigateDown",
			title: "Settings: Navigate Down",
			category: "Preferences",
		},
		{ execute: () => navigateDown() },
	);
	workspace.commands.registerCommand(
		{
			command: "settings.navigateUp",
			title: "Settings: Navigate Up",
			category: "Preferences",
		},
		{ execute: () => navigateUp() },
	);
	workspace.commands.registerCommand(
		{
			command: "settings.focusNavigation",
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
			command: "settings.focusContent",
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
			command: "settings.selectEntry",
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
				case "settings.navigateDown":
					navigateDown();
					return "handled";
				case "settings.navigateUp":
					navigateUp();
					return "handled";
				case "settings.focusNavigation":
					focusedRegion = "navigation";
					return "handled";
				case "settings.focusContent":
					focusedRegion = "content";
					return "handled";
				case "settings.selectEntry":
					return "handled";
				case "settings.focusSearch":
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

			return "ignored";
		},
	};
}
