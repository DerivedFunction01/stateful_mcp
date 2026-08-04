import { Box, Text, useInput } from "ink";
import type { CommandDescriptor } from "../lib/editor/command-descriptor";
import { t } from "../lib/shared/i18n";

interface HelpScreenProps {
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	onClose: () => void;
}

export function HelpScreen({
	editorDescriptors,
	cellDescriptors,
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
				<Text>{t("help.close", { esc: "Esc" })}</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				<Text bold underline>
					{t("help.editorCommands")}
				</Text>
				{editorDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2} flexDirection="row" flexWrap="wrap">
						<Text bold color="cyan">
							:{d.verb}
							{d.aliases && d.aliases.length > 0
								? ` (${d.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{d.descriptionKey && (
							<Text color="white"> - {t(d.descriptionKey)}</Text>
						)}
						<Text color="gray"> ({d.group})</Text>
					</Box>
				))}
				<Box paddingTop={1}>
					<Text bold underline>
						{t("help.cellCommands")}
					</Text>
				</Box>
				{cellDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2} flexDirection="row" flexWrap="wrap">
						<Text bold color="yellow">
							:{d.verb}
							{d.aliases && d.aliases.length > 0
								? ` (${d.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{d.descriptionKey && (
							<Text color="white"> - {t(d.descriptionKey)}</Text>
						)}
						<Text color="gray"> ({d.group})</Text>
					</Box>
				))}
			</Box>
			<Box paddingTop={1} paddingLeft={1}>
				<Text color="gray">
					{t("help.keys1", {
						navKeys: "j/k ↑/↓",
						insertKeys: "i/o/O",
						deleteKeys: "dd",
						yankKeys: "yy",
						pasteKey: "p",
					})}
				</Text>
				<br />
				<Text color="gray">
					{t("help.keys2", {
						undoKey: "u",
						redoKey: "Ctrl-r",
						runKey: "r",
						previewKey: "P",
						cmdToken: ":",
						searchKey: "/",
					})}
				</Text>
			</Box>
		</Box>
	);
}
