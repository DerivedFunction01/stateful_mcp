import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { Box, Text } from "ink";
import { useMemo } from "react";

interface HelpBarProps {
	mode: EditorMode;
	editorDescriptors: CommandDescriptor[];
}

export function HelpBar({ mode, editorDescriptors }: HelpBarProps) {
	const line = useMemo(() => {
		if (mode === "INSERT") {
			return ":w save  Esc NORMAL  Enter newline";
		}
		if (mode === "COMMAND") {
			return "Tab cycle  Enter execute  Esc cancel  ↑↓ history";
		}
		if (mode === "VISUAL") {
			return "d delete  y yank  Esc NORMAL  : command";
		}
		const cmds = editorDescriptors.slice(0, 6);
		return cmds
			.map((d) => {
				const label = d.aliases.length > 0 ? `${d.verb}(${d.aliases[0]})` : d.verb;
				return `:${label}`;
			})
			.join("  ");
	}, [mode, editorDescriptors]);

	return (
		<Box width="100%" height={1} paddingLeft={1} paddingRight={1}>
			<Text color="gray" dimColor>
				{line}
			</Text>
		</Box>
	);
}