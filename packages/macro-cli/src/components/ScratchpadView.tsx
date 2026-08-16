import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function ScratchpadView({ workspace }: { workspace: MacroWorkspace }) {
	const cursor = workspace.editor.buffer.getCursor();
	const lines = workspace.editor.buffer.getLines();
	const projected = workspace.scratchpad.getProjectedLines();
	return (
		<box flexDirection="column" paddingLeft={1} paddingRight={1}>
			{lines.map((line, index) => {
				const projection = projected[index];
				const isActive = cursor.line === index;
				return (
					<box key={`${index}-${line}`} flexDirection="column">
						<text attributes={isActive ? TextAttributes.INVERSE : 0}>
							{String(index + 1).padStart(3, " ")} │ {line || " "}
						</text>
						{projection?.preview && (
							<text fg={projection.isValid ? "green" : "yellow"}>
								    ↳ {projection.preview.text}
							</text>
						)}
						{projection && !projection.isValid && projection.diagnostics.length > 0 && (
							<text fg="red">    ! {projection.diagnostics[0]?.message}</text>
						)}
					</box>
				);
			})}
		</box>
	);
}
