import { TextAttributes } from "@opentui/core";
import type {
	ContextualKeyHint,
	EditorKeymapProfile,
	EditorMode,
	I18nKernel,
	MacroWorkspace,
	RegisteredView,
	WorkspaceKeybinding,
} from "@stateful-mcp/macro";
import {
	contextMatches,
	resolveKeymapBindings,
	surfaceKeybindingsForMode,
} from "@stateful-mcp/macro";
import { resolveLabel, translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiShortcutHint {
	readonly key: string;
	readonly action: string;
	readonly row?: 1 | 2;
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

function getPrimaryChord(binding?: WorkspaceKeybinding): string | undefined {
	if (!binding || !binding.chords || binding.chords.length === 0) return undefined;
	return formatKeyDisplay(binding.chords[0]!);
}

function formatPairedChords(
	bindingA?: WorkspaceKeybinding,
	bindingB?: WorkspaceKeybinding,
): string | undefined {
	const chordA = getPrimaryChord(bindingA);
	const chordB = getPrimaryChord(bindingB);
	if (chordA && chordB) return `${chordA}/${chordB}`;
	return chordA ?? chordB;
}

export function buildDynamicKeymapHints(
	keymap?: EditorKeymapProfile,
	i18n?: I18nKernel,
	mode: EditorMode = "NORMAL",
): readonly TuiShortcutHint[] {
	if (!keymap) return [];
	const bindings = resolveKeymapBindings(keymap);
	const find = (cmd: string) => bindings.find((b) => b.command === cmd);

	const hints: TuiShortcutHint[] = [];

	if (mode === "INSERT") {
		const nextTabChord = keymap.window?.nextTab
			? formatKeyDisplay(keymap.window.nextTab)
			: undefined;
		if (nextTabChord) {
			hints.push({
				key: nextTabChord,
				action: translate(i18n, "helpBar.duplicate"),
				row: 1,
			});
		}

		const applyChord = getPrimaryChord(find("editor.executeLine"));
		if (applyChord) {
			hints.push({
				key: applyChord,
				action: translate(i18n, "helpBar.apply"),
				row: 1,
			});
		}

		const navChord = formatPairedChords(
			find("cursor.moveUp"),
			find("cursor.moveDown"),
		);
		if (navChord) {
			hints.push({
				key: navChord,
				action: translate(i18n, "helpBar.navigate"),
				row: 1,
			});
		}

		const closeChord =
			getPrimaryChord(find("editor.close")) ??
			(keymap.normal?.quit ? formatKeyDisplay(keymap.normal.quit) : undefined);
		if (closeChord) {
			hints.push({
				key: closeChord,
				action: translate(i18n, "helpBar.esc"),
				row: 1,
			});
		}

		return hints;
	}

	if (mode === "VISUAL") {
		const selectRangeChord =
			formatPairedChords(find("cursor.moveUp"), find("cursor.moveDown")) ??
			(keymap.visual?.extendUp && keymap.visual?.extendDown
				? `${formatKeyDisplay(keymap.visual.extendUp)}/${formatKeyDisplay(keymap.visual.extendDown)}`
				: undefined);
		if (selectRangeChord) {
			hints.push({
				key: selectRangeChord,
				action: translate(i18n, "helpBar.selectRange"),
				row: 1,
			});
		}

		const applyChord = getPrimaryChord(find("editor.executeLine"));
		if (applyChord) {
			hints.push({
				key: applyChord,
				action: translate(i18n, "helpBar.applySelected"),
				row: 1,
			});
		}

		const delChord = keymap.visual?.deleteSelection
			? formatKeyDisplay(keymap.visual.deleteSelection)
			: undefined;
		if (delChord) {
			hints.push({
				key: delChord,
				action: translate(i18n, "helpBar.delete"),
				row: 1,
			});
		}

		const closeChord =
			getPrimaryChord(find("editor.close")) ??
			(keymap.normal?.quit ? formatKeyDisplay(keymap.normal.quit) : undefined);
		if (closeChord) {
			hints.push({
				key: closeChord,
				action: translate(i18n, "helpBar.esc"),
				row: 1,
			});
		}

		return hints;
	}

	// NORMAL mode
	// Row 1: Editor & modal motion bindings
	const nextTab = keymap.window?.nextTab;
	if (nextTab) {
		hints.push({
			key: formatKeyDisplay(nextTab),
			action: translate(i18n, "helpBar.nextTab"),
			row: 1,
		});
	}

	const insert = keymap.normal?.enterInsert;
	if (insert) {
		hints.push({
			key: formatKeyDisplay(insert),
			action: translate(i18n, "helpBar.insert"),
			row: 1,
		});
	}

	const visual = keymap.normal?.enterVisual;
	if (visual) {
		hints.push({
			key: formatKeyDisplay(visual),
			action: translate(i18n, "helpBar.visual"),
			row: 1,
		});
	}

	const deleteCell = keymap.sequences?.deleteCell;
	if (deleteCell) {
		hints.push({
			key: formatKeyDisplay(deleteCell),
			action: translate(i18n, "helpBar.delete"),
			row: 1,
		});
	}

	// Row 2: Window, palette, and container bindings
	const palette = keymap.window?.openCommandPalette;
	if (palette) {
		hints.push({
			key: formatKeyDisplay(palette),
			action: translate(i18n, "palette.title"),
			row: 2,
		});
	}

	const activity = keymap.window?.toggleActivityPanel;
	if (activity) {
		hints.push({
			key: formatKeyDisplay(activity),
			action: translate(i18n, "helpBar.activity"),
			row: 2,
		});
	}

	const sidepanel = keymap.window?.toggleSidepanel;
	if (sidepanel) {
		hints.push({
			key: formatKeyDisplay(sidepanel),
			action: translate(i18n, "helpBar.inspector"),
			row: 2,
		});
	}

	const switchSplit = keymap.window?.switchSplitFocus;
	if (switchSplit) {
		hints.push({
			key: formatKeyDisplay(switchSplit),
			action: translate(i18n, "helpBar.switchFocus"),
			row: 2,
		});
	}

	const pin = keymap.window?.pinMacro;
	if (pin) {
		hints.push({
			key: formatKeyDisplay(pin),
			action: translate(i18n, "helpBar.pin"),
			row: 2,
		});
	}

	return hints;
}

export function buildContextualHelpBarHints(
	workspace: MacroWorkspace,
	keymap?: EditorKeymapProfile,
): readonly TuiShortcutHint[] {
	const layout = workspace.layout.getSnapshot();
	const focusedPane = layout.focusedPane;
	const mode = workspace.editor.getMode();
	const i18n = workspace.i18n;

	const resolvedKeymap =
		keymap ??
		(workspace.runtime as { context?: { keymap?: EditorKeymapProfile } })
			?.context?.keymap;

	if (!resolvedKeymap) return [];

	const allBindings = resolveKeymapBindings(resolvedKeymap);
	const activeBindings = allBindings.filter(
		(b) =>
			(!b.modes || b.modes.includes(mode)) &&
			contextMatches(
				{
					activeTabId: layout.activeTabId,
					focusedPane,
					editorMode: mode,
				},
				b.when,
			),
	);

	const find = (cmd: string) => activeBindings.find((b) => b.command === cmd);

	if (focusedPane === "modal" && layout.activeModal?.id === "settings") {
		const hints: TuiShortcutHint[] = [];
		const navChord = formatPairedChords(
			find("settings.navigateDown"),
			find("settings.navigateUp"),
		);
		if (navChord)
			hints.push({ key: navChord, action: translate(i18n, "helpBar.navigate"), row: 1 });
		const focusChord = formatPairedChords(
			find("settings.focusNavigation"),
			find("settings.focusContent"),
		);
		if (focusChord)
			hints.push({ key: focusChord, action: translate(i18n, "helpBar.switchFocus"), row: 1 });
		const searchChord = getPrimaryChord(find("settings.focusSearch"));
		if (searchChord)
			hints.push({ key: searchChord, action: translate(i18n, "command.settings.focusSearch"), row: 2 });
		const saveChord = getPrimaryChord(find("settings.save"));
		if (saveChord)
			hints.push({ key: saveChord, action: translate(i18n, "command.settings.save"), row: 2 });
		const closeChord = getPrimaryChord(find("settings.back"));
		if (closeChord)
				hints.push({ key: closeChord, action: translate(i18n, "command.settings.back"), row: 2 });
		const focusRingChord = formatPairedChords(
			find("settings.focusNext"),
			find("settings.focusPrevious"),
		);
		if (focusRingChord)
			hints.push({ key: focusRingChord, action: translate(i18n, "command.settings.focusNext"), row: 1 });
		const sectionChord = formatPairedChords(
			find("settings.nextSection"),
			find("settings.previousSection"),
		);
		if (sectionChord)
			hints.push({ key: sectionChord, action: translate(i18n, "command.settings.nextSection"), row: 2 });
		return hints;
	}

	if (focusedPane === "palette") {
		const hints: TuiShortcutHint[] = [];
		const navChord = formatPairedChords(
			allBindings.find((b) => b.command === "cursor.moveUp"),
			allBindings.find((b) => b.command === "cursor.moveDown"),
		);
		if (navChord) {
			hints.push({ key: navChord, action: translate(i18n, "helpBar.navigate"), row: 1 });
		}
		const applyChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.executeLine"),
		);
		if (applyChord) {
			hints.push({ key: applyChord, action: translate(i18n, "helpBar.apply"), row: 1 });
		}
		const closeChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.close"),
		);
		if (closeChord) {
			hints.push({ key: closeChord, action: translate(i18n, "helpBar.close"), row: 1 });
		}
		return hints;
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
			typeof (view.provider as { getContextualHints?: (ctx: unknown) => unknown })
				.getContextualHints === "function"
		) {
			const providerHints = (
				view.provider as { getContextualHints: (ctx: unknown) => unknown }
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
				return providerHints.map((h: { key: string; label: string; row?: 1 | 2 }) => ({
					key: h.key,
					action: h.label,
					row: h.row ?? 1,
				}));
			}
		}

		if (container?.contextualHints && container.contextualHints.length > 0) {
			return container.contextualHints.map((h: ContextualKeyHint & { row?: 1 | 2 }) => ({
				key: h.key,
				action: resolveLabel(i18n, h.i18nKey, h.label ?? h.key),
				row: h.row ?? 1,
			}));
		}

		const hints: TuiShortcutHint[] = [];
		const navChord = formatPairedChords(
			allBindings.find((b) => b.command === "cursor.moveUp"),
			allBindings.find((b) => b.command === "cursor.moveDown"),
		);
		if (navChord) {
			hints.push({ key: navChord, action: translate(i18n, "helpBar.navigate"), row: 1 });
		}
		const openChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.executeLine"),
		);
		if (openChord) {
			hints.push({ key: openChord, action: translate(i18n, "helpBar.open"), row: 1 });
		}
		const switchFocusChord =
			getPrimaryChord(
				allBindings.find((b) => b.command === "cursor.moveLeft"),
			) ??
			(resolvedKeymap.window?.switchSplitFocus
				? formatKeyDisplay(resolvedKeymap.window.switchSplitFocus)
				: undefined);
		if (switchFocusChord) {
			hints.push({
				key: switchFocusChord,
				action: translate(i18n, "helpBar.switchFocus"),
				row: 2,
			});
		}
		const closeChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.close"),
		);
		if (closeChord) {
			hints.push({ key: closeChord, action: translate(i18n, "helpBar.editor"), row: 2 });
		}

		return hints;
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
			typeof (view.provider as { getContextualHints?: (ctx: unknown) => unknown })
				.getContextualHints === "function"
		) {
			const providerHints = (
				view.provider as { getContextualHints: (ctx: unknown) => unknown }
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
				return providerHints.map((h: { key: string; label: string; row?: 1 | 2 }) => ({
					key: h.key,
					action: h.label,
					row: h.row ?? 1,
				}));
			}
		}

		if (container?.contextualHints && container.contextualHints.length > 0) {
			return container.contextualHints.map((h: ContextualKeyHint & { row?: 1 | 2 }) => ({
				key: h.key,
				action: resolveLabel(i18n, h.i18nKey, h.label ?? h.key),
				row: h.row ?? 1,
			}));
		}

		const hints: TuiShortcutHint[] = [];
		const navChord = formatPairedChords(
			allBindings.find((b) => b.command === "cursor.moveUp"),
			allBindings.find((b) => b.command === "cursor.moveDown"),
		);
		if (navChord) {
			hints.push({ key: navChord, action: translate(i18n, "helpBar.navigate"), row: 1 });
		}
		const applyChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.executeLine"),
		);
		if (applyChord) {
			hints.push({ key: applyChord, action: translate(i18n, "helpBar.apply"), row: 1 });
		}

		const closeKey = container?.altKey
			? `Alt+${container.altKey}`
			: resolvedKeymap.window?.toggleSidepanel
				? formatKeyDisplay(resolvedKeymap.window.toggleSidepanel)
				: undefined;
		if (closeKey) {
			hints.push({ key: closeKey, action: translate(i18n, "helpBar.close"), row: 2 });
		}

		const switchFocusChord = resolvedKeymap.window?.switchSplitFocus
			? formatKeyDisplay(resolvedKeymap.window.switchSplitFocus)
			: undefined;
		if (switchFocusChord) {
			hints.push({
				key: switchFocusChord,
				action: translate(i18n, "helpBar.switchFocus"),
				row: 2,
			});
		}

		const closeChord = getPrimaryChord(
			allBindings.find((b) => b.command === "editor.close"),
		);
		if (closeChord) {
			hints.push({ key: closeChord, action: translate(i18n, "helpBar.editor"), row: 2 });
		}

		return hints;
	}

	if (focusedPane === "main" && layout.activeTabId !== "scratchpad") {
		if (layout.activeTabId === "settings") {
			const hints: TuiShortcutHint[] = [];
			const navChord = formatPairedChords(
				find("settings.navigateDown"),
				find("settings.navigateUp"),
			);
			if (navChord) {
				hints.push({ key: navChord, action: translate(i18n, "helpBar.navigate"), row: 1 });
			}

			const focusChord = formatPairedChords(
				find("settings.focusNavigation"),
				find("settings.focusContent"),
			);
			if (focusChord) {
				hints.push({ key: focusChord, action: translate(i18n, "helpBar.switchFocus"), row: 1 });
			}

			const selectChord = getPrimaryChord(find("settings.selectEntry"));
			if (selectChord) {
				hints.push({
					key: selectChord,
					action: translate(i18n, "command.settings.selectEntry"),
					row: 1,
				});
			}

			const searchChord = getPrimaryChord(find("settings.focusSearch"));
			if (searchChord) {
				hints.push({
					key: searchChord,
					action: translate(i18n, "command.settings.focusSearch"),
					row: 2,
				});
			}

			const saveChord = getPrimaryChord(find("settings.save"));
			if (saveChord) {
				hints.push({
					key: saveChord,
					action: translate(i18n, "command.settings.save"),
					row: 2,
				});
			}

			const backChord = getPrimaryChord(find("settings.back"));
			if (backChord) {
				hints.push({
					key: backChord,
					action: translate(i18n, "command.settings.back"),
					row: 2,
				});
			}

			return hints;
		}

		const tab = workspace.tabs.getTab(layout.activeTabId);
		const bindings = surfaceKeybindingsForMode(
			tab?.keybindings,
			mode,
		);
		if (bindings.length > 0)
			return bindings.map((binding, idx) => ({
				key: formatKeyDisplay(binding.key),
				action: binding.label,
				row: idx < 4 ? 1 : 2,
			}));
	}

	return buildDynamicKeymapHints(resolvedKeymap, i18n, mode);
}

export function mergeShortcutHints(
	hints: readonly TuiShortcutHint[],
): readonly TuiShortcutHint[] {
	const groups = new Map<
		string,
		{ keys: string[]; action: string; row?: 1 | 2 }
	>();

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
				row: hint.row,
			});
		}
	}

	return Array.from(groups.values()).map((g) => ({
		key: g.keys.join("/"),
		action: g.action,
		row: g.row,
	}));
}

export function TuiHelpBar({
	keymap,
	i18n,
	mode = "NORMAL",
	hints,
	customText,
	theme,
	twoRow = true,
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

	const renderBadge = (hint: TuiShortcutHint) => (
		<box key={`${hint.key}-${hint.action}`} flexDirection="row" marginRight={2}>
			<box backgroundColor={c.accentPrimary} paddingLeft={1} paddingRight={1}>
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

	if (twoRow) {
		const row1 = resolvedHints.filter((h) => (h.row ?? 1) === 1);
		const row2 = resolvedHints.filter((h) => h.row === 2);

		if (row2.length > 0) {
			return (
				<box height={2} flexDirection="column" paddingLeft={0} paddingRight={1}>
					<box height={1} flexDirection="row">
						{row1.map(renderBadge)}
					</box>
					<box height={1} flexDirection="row">
						{row2.map(renderBadge)}
					</box>
				</box>
			);
		}
	}

	return (
		<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
			{resolvedHints.map(renderBadge)}
		</box>
	);
}
