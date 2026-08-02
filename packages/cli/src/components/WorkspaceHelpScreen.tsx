import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { Box, Text, useInput } from "ink";

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
					<Box key={descriptor.verb} paddingLeft={2}>
						<Text bold color="cyan">
							:{descriptor.verb}
						</Text>
						<Text color="gray">
							{" "}
							({descriptor.group}) {descriptor.descriptionKey}
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
