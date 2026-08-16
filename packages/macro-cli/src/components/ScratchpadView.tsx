import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function ScratchpadView({ workspace }: { workspace: MacroWorkspace }) {
	const cursor = workspace.editor.buffer.getCursor();
	const lines = workspace.editor.buffer.getLines();
	const projected = workspace.scratchpad.getProjectedLines();
	return (
		<Box flexDirection="column" paddingLeft={1} paddingRight={1}>
			{lines.map((line, index) => {
				const projection = projected[index];
				const isActive = cursor.line === index;
				return (
					<Box key={`${index}-${line}`} flexDirection="column">
						<Text inverse={isActive}>
							{String(index + 1).padStart(3, " ")} │ {line || " "}
						</Text>
						{projection?.preview && (
							<Text color={projection.isValid ? "green" : "yellow"}>
								    ↳ {projection.preview.text}
							</Text>
						)}
						{projection && !projection.isValid && projection.diagnostics.length > 0 && (
							<Text color="red">    ! {projection.diagnostics[0]?.message}</Text>
						)}
					</Box>
				);
			})}
		</Box>
	);
}
