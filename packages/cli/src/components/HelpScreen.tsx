import { Box, Text } from "ink";
import { t } from "../lib/i18n";

interface HelpScreenProps {
	editorDescriptors: { verb: string; group: string }[];
	cellDescriptors: { verb: string; group: string }[];
	onClose: () => void;
}

export function HelpScreen({
	editorDescriptors,
	cellDescriptors,
	onClose: _onClose,
}: HelpScreenProps) {
	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box>
				<Text bold inverse>
					{" "}
					{t("help.title")}{" "}
				</Text>
				<Text>{t("help.close")}</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				<Text bold underline>
					{t("help.editorCommands")}
				</Text>
				{editorDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2}>
						<Text bold color="cyan">
							:{d.verb}
						</Text>
						<Text color="gray"> ({d.group})</Text>
					</Box>
				))}
				<Box paddingTop={1}>
					<Text bold underline>
						{t("help.cellCommands")}
					</Text>
				</Box>
				{cellDescriptors.map((d) => (
					<Box key={d.verb} paddingLeft={2}>
						<Text bold color="yellow">
							:{d.verb}
						</Text>
						<Text color="gray"> ({d.group})</Text>
					</Box>
				))}
			</Box>
			<Box paddingTop={1} paddingLeft={1}>
				<Text color="gray">{t("help.keys1")}</Text>
				<br />
				<Text color="gray">{t("help.keys2")}</Text>
			</Box>
		</Box>
	);
}
