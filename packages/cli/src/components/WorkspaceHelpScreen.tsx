import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { Box, Text, useInput } from "ink";

import { t } from "../lib/shared/i18n";

interface WorkspaceHelpScreenProps {
	descriptors: CommandDescriptor[];
	onClose: () => void;
}

export function WorkspaceHelpScreen({
	descriptors,
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
					Workspace Help{" "}
				</Text>
				<Text> Esc: close</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				{descriptors.map((descriptor) => (
					<Box key={descriptor.verb} paddingLeft={2} flexDirection="row" flexWrap="wrap">
						<Text bold color="cyan">
							:{descriptor.verb}
							{descriptor.aliases && descriptor.aliases.length > 0
								? ` (${descriptor.aliases.map((a) => `:${a}`).join(", ")})`
								: ""}
						</Text>
						{descriptor.descriptionKey && (
							<Text color="white"> - {t(descriptor.descriptionKey)}</Text>
						)}
						<Text color="gray">
							{" "}
							({descriptor.group})
						</Text>
					</Box>
				))}
			</Box>
			<Box paddingTop={1} paddingLeft={1} flexDirection="column">
				<Text color="gray">i/a: edit</Text>
				<Text color="gray">Enter: newline · Ctrl-Enter: submit</Text>
				<Text color="gray">Tab/arrows: completion · Esc: cancel/back</Text>
			</Box>
		</Box>
	);
}
