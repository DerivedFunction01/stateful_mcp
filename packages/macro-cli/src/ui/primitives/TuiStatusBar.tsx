import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../tokens";

export interface TuiStatusBarProps {
	readonly mode?: "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";
	readonly cursorLine?: number;
	readonly cursorCol?: number;
	readonly validCount?: number;
	readonly totalCount?: number;
	readonly pinnedMacro?: string | null;
	readonly locale?: string;
	readonly sessionTitle?: string;
	readonly diagnosticErrorCount?: number;
	readonly diagnosticWarningCount?: number;
}

export function TuiStatusBar({
	mode = "NORMAL",
	cursorLine = 1,
	cursorCol = 1,
	validCount,
	totalCount,
	pinnedMacro,
	locale = "en",
	sessionTitle,
	diagnosticErrorCount,
	diagnosticWarningCount,
}: TuiStatusBarProps) {
	const modeBg = mode === "NORMAL" ? "green" : mode === "INSERT" ? "yellow" : "cyan";

	return (
		<box height={1} borderStyle="single" borderColor={TuiNamedColors.border} paddingLeft={1} paddingRight={1} flexDirection="row">
			<text attributes={TextAttributes.BOLD | TextAttributes.INVERSE} fg={modeBg}>
				{" "}{mode}{" "}
			</text>
			{sessionTitle && (
				<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
					{" "}{sessionTitle}{" "}
				</text>
			)}
			<text fg={TuiNamedColors.primary}>
				{" "}Ln {cursorLine}, Col {cursorCol}{" "}
			</text>
			{totalCount !== undefined && totalCount > 0 && (
				<text fg={validCount === totalCount ? TuiNamedColors.success : TuiNamedColors.amber}>
					| {validCount ?? 0}/{totalCount} valid{" "}
				</text>
			)}
			{diagnosticErrorCount !== undefined && diagnosticErrorCount > 0 && (
				<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
					| E:{diagnosticErrorCount}{" "}
				</text>
			)}
			{diagnosticWarningCount !== undefined && diagnosticWarningCount > 0 && (
				<text fg={TuiNamedColors.warning}>
					| W:{diagnosticWarningCount}{" "}
				</text>
			)}
			{pinnedMacro && (
				<text fg={TuiNamedColors.accent}>
					| Pinned: {pinnedMacro}{" "}
				</text>
			)}
			<box flexGrow={1} />
			<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
				locale: {locale}
			</text>
		</box>
	);
}
