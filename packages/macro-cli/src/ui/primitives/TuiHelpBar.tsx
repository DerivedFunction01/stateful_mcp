import { TextAttributes } from "@opentui/core";
import type {
	ContextualKeyHint,
	EditorKeymapProfile,
	EditorMode,
	I18nKernel,
	MacroWorkspace,
	RegisteredView,
} from "@stateful-mcp/macro";
import { surfaceKeybindingsForMode } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiHelpBarVariant =
	| "nano-grid"
	| "lualine-pills"
	| "opencode-compact"
	| "bracket-chips"
	| "subtle-text";

export interface TuiShortcutHint {
	readonly key: string;
	readonly action: string;
}

export interface TuiHelpBarProps {
	readonly variant?: TuiHelpBarVariant;
	readonly keymap?: EditorKeymapProfile;
	readonly i18n?: I18nKernel;
	readonly mode?: EditorMode;
	readonly hints?: readonly TuiShortcutHint[];
	readonly customText?: string;
	readonly theme?: TuiThemeDefinition;
}

export function formatKeyDisplay(chord: string): string {
	const map: Record<string, string> = {
		CTRL_P: "Ctrl+P",
		CTRL_B: "Ctrl+B",
		CTRL_E: "Ctrl+E",
		CTRL_W: "Ctrl+W",
		CTRL_R: "Ctrl+R",
		CTRL_S: "Ctrl+S",
		CTRL_SHIFT_R: "Ctrl+Shift+R",
		CTRL_ALT_R: "Ctrl+Alt+R",
		ALT_P: "Alt+P",
		CTRL_ENTER: "Ctrl+Enter",
		TAB: "Tab",
		SHIFT_TAB: "Shift+Tab",
		ESC: "Esc",
		ENTER: "Enter",
		DELETE: "Del",
		BACKSPACE: "Bksp",
	};
	return map[chord] ?? chord;
}

export function buildDynamicKeymapHints(
	keymap: EditorKeymapProfile,
	i18n?: I18nKernel,
	mode: EditorMode = "NORMAL",
): readonly TuiShortcutHint[] {
	if (mode === "INSERT") {
		return [
			{
				key: formatKeyDisplay(keymap.window.nextTab || "Tab"),
				action: translate(i18n, "helpBar.duplicate", "New Line"),
			},
			{
				key: "Enter",
				action: translate(i18n, "helpBar.apply", "Execute"),
			},
			{
				key: "↑/↓",
				action: translate(i18n, "helpBar.navigate", "Navigate"),
			},
			{
				key: "Esc",
				action: translate(i18n, "helpBar.esc", "Normal Mode"),
			},
		];
	}

	if (mode === "VISUAL") {
		return [
			{
				key: "↑/↓",
				action: translate(i18n, "helpBar.selectRange", "Select Range"),
			},
			{
				key: "Enter",
				action: translate(i18n, "helpBar.applySelected", "Execute Selected"),
			},
			{
				key: formatKeyDisplay(keymap.visual.deleteSelection || "d"),
				action: translate(i18n, "helpBar.delete", "Delete"),
			},
			{
				key: "Esc",
				action: translate(i18n, "helpBar.esc", "Normal Mode"),
			},
		];
	}

	// NORMAL mode
	return [
		{
			key: formatKeyDisplay(keymap.window.nextTab || "Tab"),
			action: translate(i18n, "helpBar.nextTab", "Next Tab"),
		},
		{
			key: formatKeyDisplay(keymap.normal.enterInsert || "i"),
			action: translate(i18n, "helpBar.insert", "Insert"),
		},
		{
			key: formatKeyDisplay(keymap.normal.enterVisual || "v"),
			action: translate(i18n, "helpBar.visual", "Visual"),
		},
		{
			key: formatKeyDisplay(keymap.sequences.deleteCell || "dd"),
			action: translate(i18n, "helpBar.delete", "Delete"),
		},
		{
			key: formatKeyDisplay(keymap.window.openCommandPalette),
			action: translate(i18n, "palette.title", "Command Palette"),
		},
		{
			key: formatKeyDisplay(keymap.window.toggleActivityPanel || "Ctrl+E"),
			action: translate(i18n, "helpBar.activity", "Activity"),
		},
		{
			key: formatKeyDisplay(keymap.window.toggleSidepanel),
			action: translate(i18n, "inspector.title", "Inspector"),
		},
		{
			key: formatKeyDisplay(keymap.window.switchSplitFocus || "Ctrl+W"),
			action: translate(i18n, "helpBar.switchFocus", "Focus Pane"),
		},
		{
			key: formatKeyDisplay(keymap.window.pinMacro || "Alt+P"),
			action: translate(i18n, "helpBar.pin", "Pin"),
		},
	];
}

/**
 * Resolves contextual shortcut hints dynamically based on the currently focused pane:
 * - When in editor ('main'): returns mode-based keymap hints
 * - When in 'palette': returns query navigation and execution hints
 * - When in 'activity' or 'sidepanel': queries active view provider or container contextualHints
 */
export function buildContextualHelpBarHints(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
): readonly TuiShortcutHint[] {
	const layout = workspace.layout.getSnapshot();
	const focusedPane = layout.focusedPane;
	const i18n = workspace.i18n;

	if (focusedPane === "palette") {
		return [
			{ key: "↑/↓", action: translate(i18n, "helpBar.navigate", "Navigate") },
			{ key: "Enter", action: translate(i18n, "helpBar.apply", "Execute") },
			{ key: "Esc", action: translate(i18n, "helpBar.close", "Close") },
		];
	}

	if (focusedPane === "activity") {
		const container = workspace.views.getContainer(
			layout.activeActivityContainerId,
		);
		const view = workspace.views
			.getViewsForContainer(container?.id ?? "")
			.find((v: RegisteredView) => Boolean(v.provider));

		if (
			view?.provider &&
			"getContextualHints" in view.provider &&
			typeof (view.provider as { getContextualHints?: Function })
				.getContextualHints === "function"
		) {
			const providerHints = (
				view.provider as { getContextualHints: Function }
			).getContextualHints({
				workspace,
				width: 30,
				height: 20,
				isFocused: true,
				viewId: view.id,
				emitAction: (id: string, payload?: unknown) =>
					void workspace.commands.executeCommand(id, payload),
			});
			if (
				providerHints &&
				Array.isArray(providerHints) &&
				providerHints.length > 0
			) {
				return providerHints.map((h: { key: string; label: string }) => ({
					key: h.key,
					action: h.label,
				}));
			}
		}

		if (container?.contextualHints && container.contextualHints.length > 0) {
			return container.contextualHints.map((h: ContextualKeyHint) => ({
				key: h.key,
				action: h.i18nKey
					? translate(i18n, h.i18nKey, h.label ?? h.key)
					: (h.label ?? h.key),
			}));
		}

		return [
			{ key: "↑/↓", action: translate(i18n, "helpBar.navigate", "Navigate") },
			{ key: "Enter", action: translate(i18n, "helpBar.open", "Open") },
			{
				key: "Ctrl+W",
				action: translate(i18n, "helpBar.switchFocus", "Focus Pane"),
			},
			{ key: "Esc", action: translate(i18n, "helpBar.editor", "Editor") },
		];
	}

	if (focusedPane === "sidepanel") {
		const container = workspace.views.getContainer(
			layout.activeInspectorContainerId,
		);
		const view = workspace.views
			.getViewsForContainer(container?.id ?? "")
			.find((v: RegisteredView) => Boolean(v.provider));

		if (
			view?.provider &&
			"getContextualHints" in view.provider &&
			typeof (view.provider as { getContextualHints?: Function })
				.getContextualHints === "function"
		) {
			const providerHints = (
				view.provider as { getContextualHints: Function }
			).getContextualHints({
				workspace,
				width: 30,
				height: 20,
				isFocused: true,
				viewId: view.id,
				emitAction: (id: string, payload?: unknown) =>
					void workspace.commands.executeCommand(id, payload),
			});
			if (
				providerHints &&
				Array.isArray(providerHints) &&
				providerHints.length > 0
			) {
				return providerHints.map((h: { key: string; label: string }) => ({
					key: h.key,
					action: h.label,
				}));
			}
		}

		if (container?.contextualHints && container.contextualHints.length > 0) {
			return container.contextualHints.map((h: ContextualKeyHint) => ({
				key: h.key,
				action: h.i18nKey
					? translate(i18n, h.i18nKey, h.label ?? h.key)
					: (h.label ?? h.key),
			}));
		}

		const closeKey = container?.altKey ? `Alt+${container.altKey}` : "Ctrl+B";
		return [
			{ key: "↑/↓", action: translate(i18n, "helpBar.navigate", "Navigate") },
			{ key: "Enter", action: translate(i18n, "helpBar.apply", "Execute") },
			{ key: closeKey, action: translate(i18n, "helpBar.close", "Close") },
			{
				key: "Ctrl+W",
				action: translate(i18n, "helpBar.switchFocus", "Focus Pane"),
			},
			{ key: "Esc", action: translate(i18n, "helpBar.editor", "Editor") },
		];
	}

	if (focusedPane === "main" && layout.activeTabId !== "scratchpad") {
		const tab = workspace.tabs.getTab(layout.activeTabId);
		const bindings = surfaceKeybindingsForMode(
			tab?.keybindings,
			workspace.editor.getMode(),
		);
		if (bindings.length > 0)
			return bindings.map((binding) => ({
				key: formatKeyDisplay(binding.key),
				action: binding.label,
			}));
	}

	return buildDynamicKeymapHints(
		keymap ??
			(workspace.runtime as any)?.context?.keymap ?? {
				window: {},
				normal: {},
				insert: {},
				visual: {},
				sequences: {},
			},
		workspace.i18n,
		workspace.editor.getMode(),
	);
}

export function TuiHelpBar({
	variant = "nano-grid",
	keymap,
	i18n,
	mode = "NORMAL",
	hints,
	customText,
	theme,
}: TuiHelpBarProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	if (customText) {
		return (
			<box height={1} paddingLeft={0} paddingRight={1}>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{customText}
				</text>
			</box>
		);
	}

	const resolvedHints =
		hints ?? (keymap ? buildDynamicKeymapHints(keymap, i18n, mode) : []);

	// 1. Nano / Htop High-Contrast Inverse Badges (Default)
	if (variant === "nano-grid") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint) => (
					<box
						key={`${hint.key}-${hint.action}`}
						flexDirection="row"
						marginRight={2}
					>
						<box
							backgroundColor={c.accentPrimary}
							paddingLeft={1}
							paddingRight={1}
						>
							<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
								{hint.key}
							</text>
						</box>
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{" "}
							{hint.action}
						</text>
					</box>
				))}
			</box>
		);
	}

	// 2. Lualine Continuous Ribbon with Glyph Dividers & Zero Gaps
	if (variant === "lualine-pills") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint) => (
					<box
						key={`${hint.key}-${hint.action}`}
						flexDirection="row"
						backgroundColor={c.bgSurface}
						paddingLeft={0}
						paddingRight={1}
						marginRight={0}
					>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							▎
						</text>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							{" "}
							{hint.key}
						</text>
						<text fg={c.fgPrimary}> {hint.action} </text>
						<text fg={c.borderDefault}>│</text>
					</box>
				))}
			</box>
		);
	}

	// 3. OpenCode Minimalist Compact Glyph Strip
	if (variant === "opencode-compact") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint, index) => (
					<box key={`${hint.key}-${hint.action}`} flexDirection="row">
						{index > 0 && <text fg={c.borderDefault}> • </text>}
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							{hint.key}
						</text>
						<text fg={c.fgMuted}> {hint.action}</text>
					</box>
				))}
			</box>
		);
	}

	// 4. Subtle Clean Text Strip
	if (variant === "subtle-text") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint, index) => (
					<box key={`${hint.key}-${hint.action}`} flexDirection="row">
						{index > 0 && <text fg={c.borderDefault}> · </text>}
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{hint.key}: {hint.action}
						</text>
					</box>
				))}
			</box>
		);
	}

	// 5. Bracket Chips (Original Clean Format)
	return (
		<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
			{resolvedHints.map((hint, index) => (
				<box key={`${hint.key}-${hint.action}`} flexDirection="row">
					{index > 0 && <text fg={c.borderDefault}> │ </text>}
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						[ {hint.key} ]
					</text>
					<text fg={c.fgMuted}> {hint.action}</text>
				</box>
			))}
		</box>
	);
}
