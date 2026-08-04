import { Box, Text } from "ink";
import type { EditorKeymapProfile } from "../editor/editor-keymap-profile";
import { editorKeymapHelpGroups } from "../../bootstrap/editor-keymap-defaults";
import { t } from "../shared/i18n";
import { palette } from "./palette";

const SPECIAL_LABELS: Record<string, string> = {
	CTRL_R: "help.key.ctrlR",
	ENTER: "help.key.enter",
	ESC: "help.key.escape",
	DELETE: "help.key.delete",
	UP: "help.key.up",
	DOWN: "help.key.down",
};

function displayChord(chord: string): string {
	const labelKey = SPECIAL_LABELS[chord];
	return labelKey ? t(labelKey) : chord;
}

function displayCombos(combos: string[]): string {
	return combos.map(displayChord).join("/");
}

/** Derive the display rows from the active keymap profile (profile-owned). */
export function bindingGroups(profile: EditorKeymapProfile) {
	return editorKeymapHelpGroups.map((group) => ({
		labelKey: group.labelKey,
		rows: group.bindings.map((binding) => ({
			labelKey: `help.binding.${binding[0]}`,
			combos: binding.map((name) => {
				const section = name in profile.normal ? profile.normal : name in profile.sequences ? profile.sequences : profile.visual;
				return section[name as keyof typeof section] as string;
			}),
		})),
	}));
}

export function KeyBindingsList({
	profile,
}: {
	profile?: EditorKeymapProfile;
}) {
	if (!profile) return null;
	return (
		<Box flexDirection="column" paddingTop={1} paddingLeft={1}>
			<Text bold underline color={palette.header}>{t("help.keysTitle")}</Text>
			{bindingGroups(profile).map((group) => (
				<Box key={group.labelKey} flexDirection="column" paddingTop={1}>
					<Text bold color={palette.header}>{t(group.labelKey)}</Text>
					{group.rows.map((row) => (
						<Box key={row.labelKey} paddingLeft={2} flexDirection="row" flexWrap="wrap">
							<Text bold color={palette.emphasized}>{displayCombos(row.combos)}</Text>
							<Text color={palette.muted}>  {t(row.labelKey)}</Text>
						</Box>
					))}
				</Box>
			))}
		</Box>
	);
}
