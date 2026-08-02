import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { t } from "../lib/shared/i18n";

interface HelpBarProps {
	mode: EditorMode;
	editorDescriptors: CommandDescriptor[];
}

export function HelpBar({ mode, editorDescriptors }: HelpBarProps) {
	const line = useMemo(() => {
		if (mode === "INSERT") {
			return t("help.insert", {
				saveCmd: ":w",
				esc: "Esc",
				enter: "Enter",
			});
		}
		if (mode === "COMMAND") {
			return t("help.command", {
				tab: "Tab",
				enter: "Enter",
				esc: "Esc",
				arrows: "↑↓",
			});
		}
		if (mode === "MACRO") return "Ctrl+Enter submit batch  Enter new line  Esc cancel";
		if (mode === "VISUAL") {
			return t("help.visual", {
				delKey: "d",
				yankKey: "y",
				esc: "Esc",
				cmdToken: ":",
			});
		}
		const cmds = editorDescriptors.slice(0, 6);
		const cmdLine = cmds
			.map((d) => {
				const label =
					d.aliases.length > 0 ? `${d.verb}(${d.aliases[0]})` : d.verb;
				return `:${label}`;
			})
			.join("  ");
		return cmdLine ? `gw workspace  ${cmdLine}` : "gw workspace";
	}, [mode, editorDescriptors]);

	return (
		<Box width="100%" height={1} paddingLeft={1} paddingRight={1}>
			<Text color="gray" dimColor>
				{line}
			</Text>
		</Box>
	);
}
