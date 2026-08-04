import { Box, Text, useInput } from "ink";
import type { CommandDescriptor } from "../lib/editor/command-descriptor";
import type { EditorKeymapProfile } from "../lib/editor/editor-keymap-profile";
import { KeyBindingsList } from "../lib/ui/HelpBindings";
import { palette } from "../lib/ui/palette";

import { t } from "../lib/shared/i18n";

interface WorkspaceHelpScreenProps {
	descriptors: CommandDescriptor[];
	keymapProfile?: EditorKeymapProfile;
	onClose: () => void;
}

export function WorkspaceHelpScreen({
	descriptors,
	keymapProfile,
	onClose,
}: WorkspaceHelpScreenProps) {
	useInput((_input, key) => {
		if (key.escape) onClose();
	});

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box>
				<Text bold inverse>
					{" "}
					{t("help.workspaceTitle")}{" "}
				</Text>
				<Text>{t("help.close", { esc: t("help.key.escape") })}</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				{descriptors.map((descriptor) => (
					<Box
						key={descriptor.verb}
						paddingLeft={2}
						flexDirection="row"
						flexWrap="wrap"
					>
						<Text bold color={palette.emphasized}>
							:{descriptor.verb}
							{descriptor.aliases && descriptor.aliases.length > 0
								? ` (${descriptor.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{descriptor.descriptionKey && (
							<Text color={palette.description}>
								{" "}
								- {t(descriptor.descriptionKey)}
							</Text>
						)}
						<Text color={palette.muted}> ({descriptor.group})</Text>
					</Box>
				))}
			</Box>
			<KeyBindingsList profile={keymapProfile} />
			<Box paddingTop={1} paddingLeft={1} flexDirection="column">
				<Text color={palette.muted}>{t("help.workspace.hints")}</Text>
			</Box>
		</Box>
	);
}
