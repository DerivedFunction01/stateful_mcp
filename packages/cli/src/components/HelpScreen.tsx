import { Box, Text, useInput } from "ink";
import type { CommandDescriptor } from "../lib/editor/command-descriptor";
import type { EditorKeymapProfile } from "../lib/editor/editor-keymap-profile";
import { KeyBindingsList } from "../lib/ui/HelpBindings";
import { palette } from "../lib/ui/palette";
import { t } from "../lib/shared/i18n";

interface HelpScreenProps {
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	keymapProfile?: EditorKeymapProfile;
	onClose: () => void;
}

export function HelpScreen({
	editorDescriptors,
	cellDescriptors,
	keymapProfile,
	onClose,
}: HelpScreenProps) {
	useInput((_input, key) => {
		if (key.escape) onClose();
	});

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box>
				<Text bold inverse>
					{" "}
					{t("help.title")}{" "}
				</Text>
				<Text>{t("help.close", { esc: t("help.key.escape") })}</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				<Text bold underline color={palette.header}>
					{t("help.editorCommands")}
				</Text>
				{editorDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2} flexDirection="row" flexWrap="wrap">
						<Text bold color={palette.emphasized}>
							:{d.verb}
							{d.aliases && d.aliases.length > 0
								? ` (${d.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{d.descriptionKey && (
							<Text color={palette.description}> - {t(d.descriptionKey)}</Text>
						)}
						<Text color={palette.muted}> ({d.group})</Text>
					</Box>
				))}
				<Box paddingTop={1}>
					<Text bold underline color={palette.header}>
						{t("help.cellCommands")}
					</Text>
				</Box>
				{cellDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2} flexDirection="row" flexWrap="wrap">
						<Text bold color={palette.secondary}>
							:{d.verb}
							{d.aliases && d.aliases.length > 0
								? ` (${d.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{d.descriptionKey && (
							<Text color={palette.description}> - {t(d.descriptionKey)}</Text>
						)}
						<Text color={palette.muted}> ({d.group})</Text>
					</Box>
				))}
			</Box>
			<KeyBindingsList profile={keymapProfile} />
		</Box>
	);
}
