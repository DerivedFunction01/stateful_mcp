import { TextAttributes } from "@opentui/core";
import type { EditorKeymapProfile, I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { TuiColors, TuiNamedColors } from "../tokens";

export type TuiHelpBarVariant =
	| "lualine-pills"
	| "nano-grid"
	| "opencode-compact"
	| "bracket-chips"
	| "subtle-text";

export interface TuiShortcutHint {
	readonly key: string;
	readonly action: string;
}

export type TuiHelpBarMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

export interface TuiHelpBarProps {
	readonly variant?: TuiHelpBarVariant;
	readonly keymap?: EditorKeymapProfile;
	readonly i18n?: I18nKernel;
	readonly mode?: TuiHelpBarMode;
	readonly hints?: readonly TuiShortcutHint[];
	readonly customText?: string;
}

export function formatKeyDisplay(chord: string): string {
	const map: Record<string, string> = {
		CTRL_P: "Ctrl+P",
		CTRL_B: "Ctrl+B",
		CTRL_W: "Ctrl+W",
		CTRL_R: "Ctrl+R",
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
	mode: TuiHelpBarMode = "NORMAL",
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
				action: translate(i18n, "helpBar.navigate", "Select Range"),
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
			key: `${formatKeyDisplay(keymap.normal.enterInsert || "i")} / Enter`,
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
			key: formatKeyDisplay(keymap.window.toggleSidepanel),
			action: translate(i18n, "inspector.title", "Sidepanel"),
		},
		{
			key: formatKeyDisplay(keymap.window.pinMacro || "Alt+P"),
			action: translate(i18n, "helpBar.pin", "Pin"),
		},
	];
}

export function TuiHelpBar({
	variant = "nano-grid",
	keymap,
	i18n,
	mode = "NORMAL",
	hints,
	customText,
}: TuiHelpBarProps) {
	if (customText) {
		return (
			<box height={1} paddingLeft={0} paddingRight={1}>
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					{customText}
				</text>
			</box>
		);
	}

	const resolvedHints = hints ?? (keymap ? buildDynamicKeymapHints(keymap, i18n, mode) : []);

	// 1. Lualine Continuous Ribbon with Glyph Dividers & Zero Gaps
	if (variant === "lualine-pills") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint) => (
					<box
						key={`${hint.key}-${hint.action}`}
						flexDirection="row"
						backgroundColor={TuiColors.bgSurface}
						paddingLeft={0}
						paddingRight={1}
						marginRight={0}
					>
						<text fg="cyan" attributes={TextAttributes.BOLD}>
							▎
						</text>
						<text fg="cyan" attributes={TextAttributes.BOLD}>
							{" "}{hint.key}
						</text>
						<text fg={TuiNamedColors.primary}>
							{" "}{hint.action}{" "}
						</text>
						<text fg={TuiNamedColors.border}>
							│
						</text>
					</box>
				))}
			</box>
		);
	}

	// 2. Nano / Htop High-Contrast Inverse Badges (Flush with StatusBar column 0)
	if (variant === "nano-grid") {
		return (
			<box height={1} paddingLeft={0} paddingRight={1} flexDirection="row">
				{resolvedHints.map((hint) => (
					<box key={`${hint.key}-${hint.action}`} flexDirection="row" marginRight={2}>
						<box backgroundColor="#38bdf8" paddingLeft={1} paddingRight={1}>
							<text fg="#0d1117" attributes={TextAttributes.BOLD}>
								{hint.key}
							</text>
						</box>
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{" "}{hint.action}
						</text>
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
						{index > 0 && <text fg={TuiNamedColors.border}>  •  </text>}
						<text fg="cyan" attributes={TextAttributes.BOLD}>
							{hint.key}
						</text>
						<text fg={TuiNamedColors.muted}>
							{" "}{hint.action}
						</text>
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
						{index > 0 && <text fg={TuiNamedColors.border}>  ·  </text>}
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
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
					{index > 0 && <text fg={TuiNamedColors.border}> │ </text>}
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						[ {hint.key} ]
					</text>
					<text fg={TuiNamedColors.muted}>
						{" "}{hint.action}
					</text>
				</box>
			))}
		</box>
	);
}
