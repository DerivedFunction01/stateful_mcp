import type { NotebookEditorMode, NotebookRunMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import { t } from "../lib/shared/i18n";

interface StatusBarProps {
	mode: NotebookEditorMode;
	cellCount: number;
	activeIndex: number;
	sessionId: string;
	dirty: boolean;
	sessionMode: NotebookRunMode;
	message: string | null;
	visualStart: number;
	visualEnd: number;
	defaultSection: string;
	defaultSchema: string | null;
}

export function StatusBar({
	mode,
	cellCount,
	activeIndex,
	sessionId,
	dirty,
	sessionMode,
	message,
	visualStart,
	visualEnd,
	defaultSection,
	defaultSchema,
}: StatusBarProps) {
	const modeColor =
		mode === "NORMAL"
			? "green"
			: mode === "INSERT"
				? "yellow"
				: mode === "COMMAND"
					? "blue"
					: "magenta";
	const dirtyFlag = dirty ? " [+]" : "";
	const policyLabel = sessionMode === "execute" ? "EXEC" : "PREV";
	const policyColor = sessionMode === "execute" ? "green" : "cyan";
	const defaultLabel = defaultSchema
		? `${defaultSection} / ${defaultSchema}`
		: defaultSection;

	let modeLabel = mode;
	if (mode === "VISUAL") {
		const lo = Math.min(visualStart, visualEnd);
		const hi = Math.max(visualStart, visualEnd);
		const count = hi - lo + 1;
		modeLabel = `VISUAL (${count})` as any;
	}

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
					{modeLabel}
				</Text>
				<Text>
					{" "}
					|{" "}
					{t("statusbar.cell", {
						current: activeIndex + 1,
						total: cellCount,
					})}
					{dirtyFlag}
				</Text>
				<Text>
					{" "}
					| <Text color={policyColor}>{policyLabel}</Text>
				</Text>
				<Text>
					{" "}
					|{" "}
					<Text color="magenta">
						{t("statusbar.ins", { label: defaultLabel })}
					</Text>
				</Text>
				{message && (
					<Text>
						{" "}
						| <Text color="green">{message}</Text>
					</Text>
				)}
			</Box>
			<Box>
				<Text color="gray">{sessionId.slice(0, 20)}</Text>
			</Box>
		</Box>
	);
}
