import { Box, Text } from "ink";

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
					HELP{" "}
				</Text>
				<Text> — press Esc to close</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				<Text bold underline>
					Editor commands
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
						Cell commands
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
				<Text color="gray">
					Keys: j/k ↑/↓ navigate i/o/O insert dd delete yy yank p paste
				</Text>
				<br />
				<Text color="gray">
					u undo Ctrl-r redo r run P preview : command / search
				</Text>
			</Box>
		</Box>
	);
}
