import { TextAttributes } from "@opentui/core";
import type { EditorKeymapProfile, I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { TuiNamedColors } from "../tokens";

export interface TuiShortcutHint {
	readonly key: string;
	readonly action: string;
}

export interface TuiHelpBarProps {
	readonly keymap?: EditorKeymapProfile;
	readonly i18n?: I18nKernel;
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
): readonly TuiShortcutHint[] {
	return [
		{
			key: formatKeyDisplay(keymap.window.openCommandPalette),
			action: translate(i18n, "palette.title", "Commands"),
		},
		{
			key: formatKeyDisplay(keymap.window.toggleSidepanel),
			action: translate(i18n, "inspector.title", "Sidepanel"),
		},
		{
			key: formatKeyDisplay(keymap.window.pinMacro || "Alt+P"),
			action: translate(i18n, "helpBar.pin", "Pin"),
		},
		{
			key: formatKeyDisplay(keymap.normal.runCell || "Ctrl+Enter"),
			action: translate(i18n, "helpBar.execute", "Run"),
		},
		{
			key: formatKeyDisplay(keymap.normal.quit || "Ctrl+C"),
			action: translate(i18n, "helpBar.quit", "Quit"),
		},
	];
}

export function TuiHelpBar({
	keymap,
	i18n,
	hints,
	customText,
}: TuiHelpBarProps) {
	if (customText) {
		return (
			<box height={1} paddingLeft={1} paddingRight={1}>
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					{customText}
				</text>
			</box>
		);
	}

	const resolvedHints = hints ?? (keymap ? buildDynamicKeymapHints(keymap, i18n) : []);

	return (
		<box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
			{resolvedHints.map((hint, index) => (
				<box key={`${hint.key}-${hint.action}`} flexDirection="row">
					{index > 0 && <text fg={TuiNamedColors.border}> | </text>}
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
