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

export interface TuiShortcutHint {
	readonly key: string;
	readonly action: string;
}

export interface TuiHelpBarProps {
	readonly keymap?: EditorKeymapProfile;
	readonly i18n?: I18nKernel;
	readonly mode?: EditorMode;
	readonly hints?: readonly TuiShortcutHint[];
	readonly customText?: string;
	readonly theme?: TuiThemeDefinition;
	readonly twoRow?: boolean;
}

export function formatKeyDisplay(chord: string): string {
	const parts = chord.trim().split("+");
	if (parts.length === 1) {
		const single = parts[0]!;
		const lower = single.toLowerCase();
		if (lower === "escape" || lower === "esc") return "Esc";
		if (lower === "enter" || lower === "return") return "Enter";
		if (lower === "tab") return "Tab";
		if (lower === "backspace") return "Bksp";
		if (lower === "delete") return "Del";
		if (lower === "pageup") return "PgUp";
		if (lower === "pagedown") return "PgDn";
		if (lower === "up") return "Up";
		if (lower === "down") return "Down";
		if (lower === "left") return "Left";
		if (lower === "right") return "Right";
		return single;
	}
	const formatted = parts.map((part) => {
		const lower = part.toLowerCase();
		if (lower === "ctrl") return "Ctrl";
		if (lower === "meta" || lower === "alt") return "Alt";
		if (lower === "shift") return "Shift";
		if (lower === "escape" || lower === "esc") return "Esc";
		if (lower === "enter" || lower === "return") return "Enter";
		if (lower === "tab") return "Tab";
		if (lower === "backspace") return "Bksp";
		if (lower === "delete") return "Del";
		if (lower.length === 1) return lower.toUpperCase();
		return lower.charAt(0).toUpperCase() + lower.slice(1);
	});
	return formatted.join("+");
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
			key: formatKeyDisplay(keymap.window.openCommandPalette || "Ctrl+P"),
			action: translate(i18n, "palette.title", "Command Palette"),
		},
		{
			key: formatKeyDisplay(keymap.window.toggleActivityPanel || "Ctrl+E"),
			action: translate(i18n, "helpBar.activity", "Activity"),
		},
		{
			key: formatKeyDisplay(keymap.window.toggleSidepanel || "Ctrl+B"),
			action: translate(i18n, "helpBar.inspector", "Inspector"),
		},
		{
			key: formatKeyDisplay(keymap.window.switchSplitFocus || "Ctrl+W"),
			action: translate(i18n, "helpBar.switchFocus", "Focus Pane"),
		},
		{
			key: formatKeyDisplay(keymap.window.pinMacro || "Meta+P"),
			action: translate(i18n, "helpBar.pin", "Pin"),
		},
	];
}

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

export function mergeShortcutHints(
	hints: readonly TuiShortcutHint[],
): readonly TuiShortcutHint[] {
	const groups = new Map<string, { keys: string[]; action: string }>();

	for (const hint of hints) {
		const actionKey = hint.action.trim().toLowerCase();
		const existing = groups.get(actionKey);
		if (existing) {
			if (!existing.keys.includes(hint.key)) {
				existing.keys.push(hint.key);
			}
		} else {
			groups.set(actionKey, {
				keys: [hint.key],
				action: hint.action,
			});
		}
	}

	return Array.from(groups.values()).map((g) => ({
		key: g.keys.join("/"),
		action: g.action,
	}));
}

export function TuiHelpBar({
	keymap,
	i18n,
	mode = "NORMAL",
	hints,
	customText,
	theme,
	twoRow,
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

	const rawHints =
		hints ?? (keymap ? buildDynamicKeymapHints(keymap, i18n, mode) : []);
	const resolvedHints = mergeShortcutHints(rawHints);

	const isTwoRow = twoRow ?? resolvedHints.length > 5;

	const renderBadge = (hint: TuiShortcutHint) => (
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
	);

	if (isTwoRow && resolvedHints.length > 3) {
		const midpoint = Math.ceil(resolvedHints.length / 2);
		const row1 = resolvedHints.slice(0, midpoint);
		const row2 = resolvedHints.slice(midpoint);

		return (
			<box flexDirection="column" paddingLeft={0} paddingRight={1}>
				<box height={1} flexDirection="row">
					{row1.map(renderBadge)}
				</box>
				<box height={1} flexDirection="row">
					{row2.map(renderBadge)}
				</box>
			</box>
		);
	}

	return (
		<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
			{resolvedHints.map(renderBadge)}
		</box>
	);
}
