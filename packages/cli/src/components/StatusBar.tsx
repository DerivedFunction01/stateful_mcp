import { Box, Text } from "ink";
import type { EditorMode } from "../lib/keymap";
import type { ExecutionPolicy } from "../hooks/useNotebook";

interface StatusBarProps {
	mode: EditorMode;
	cellCount: number;
	activeIndex: number;
	sessionId: string;
	dirty: boolean;
	sessionMode: ExecutionPolicy;
}

export function StatusBar({
	mode,
	cellCount,
	activeIndex,
	sessionId,
	dirty,
	sessionMode,
}: StatusBarProps) {
	const modeColor = mode === "NORMAL" ? "green" : "yellow";
	const dirtyFlag = dirty ? " [+]" : "";
	const policyLabel =
		sessionMode === "execute" ? "EXEC" : "PREV";
	const policyColor = sessionMode === "execute" ? "green" : "cyan";

	return (
		<Box
			width="100%"
			height={1}
			borderStyle="single"
			borderTop={true}
			paddingLeft={1}
			paddingRight={1}
		>
			<Box flexGrow={1}>
				<Text bold color={modeColor}>
					{mode}
				</Text>
				<Text>
					{" "}
					| cell {activeIndex + 1}/{cellCount}
					{dirtyFlag}
				</Text>
				<Text>
					{" "}
					| <Text color={policyColor}>{policyLabel}</Text>
				</Text>
			</Box>
			<Box>
				<Text color="gray">{sessionId.slice(0, 20)}</Text>
			</Box>
		</Box>
	);
}