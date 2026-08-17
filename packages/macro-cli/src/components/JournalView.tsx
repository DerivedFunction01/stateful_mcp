import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiStatusBadge, type TuiStatusType, getStatusMeta } from "../ui/primitives/TuiBadge";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";
import { translate } from "../locales";
import type { I18nKernel } from "@stateful-mcp/macro";

export interface JournalViewProps {
	readonly workspace: MacroWorkspace;
	readonly selectedIndex?: number;
	readonly isFocused?: boolean;
	readonly theme?: TuiThemeDefinition;
}

/**
 * Calculates deterministic gutter formatting for journal entries,
 * ensuring vertical pipe separators (│) align across all line number widths.
 */
export function formatJournalGutter(
	lineNumber: number | null | undefined,
	gutterWidth: number = 2,
): { lineNumText: string; isLine: boolean } {
	if (lineNumber !== null && lineNumber !== undefined) {
		return {
			lineNumText: String(lineNumber).padStart(gutterWidth, "0"),
			isLine: true,
		};
	}
	return {
		lineNumText: " ".repeat(gutterWidth),
		isLine: false,
	};
}

export function JournalView({
	workspace,
	selectedIndex = 0,
	isFocused = true,
	theme,
}: JournalViewProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const entries = workspace.journal.getEntries();
	const i18n: I18nKernel | undefined = workspace.i18n;

	const t = (key: string, fallback: string, params?: Readonly<Record<string, unknown>>) =>
		translate(i18n, key, fallback, params);

	const title = t("journal.title", "Journal");
	const emptyMsg = t("journal.empty", "No committed entries.");
	const hintNavigate = t("journal.hint.navigate", "↑↓ Navigate · ↵ Inspect");

	const count = entries.length;
	const countLabel = count === 1
		? t("journal.entry", "entry")
		: t("journal.entries", "entries");

	// Compute uniform gutter width based on max line number in this journal
	const maxLineNum = Math.max(1, ...entries.map((e) => e.lineNumber));
	const gutterWidth = Math.max(2, String(maxLineNum).length);

	return (
		<box flexDirection="column" padding={1}>
			{/* Journal Section Header */}
			<box height={1} marginBottom={1} flexDirection="row">
				<text fg={isFocused ? c.accentPrimary : c.fgPrimary} attributes={TextAttributes.BOLD}>
					📜 {title}
				</text>
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{" "}({count} {countLabel})
				</text>
				<box flexGrow={1} />
				{isFocused && (
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{hintNavigate}
					</text>
				)}
			</box>

			{entries.length === 0 && (
				<box padding={1}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{emptyMsg}
					</text>
				</box>
			)}

			{entries.map((entry, idx) => {
				const isEntrySelected = idx === selectedIndex;
				const statusType: TuiStatusType =
					entry.status === "committed"
						? "committed"
						: entry.status === "reversed"
							? "reversed"
							: "superseded";

				const statusMeta = getStatusMeta(statusType);
				const statusColor = c[statusMeta.colorKey];
				const lineGutter = formatJournalGutter(entry.lineNumber, gutterWidth);
				const emptyGutter = formatJournalGutter(null, gutterWidth);

				const timeStr = new Date(entry.executedAt || Date.now())
					.toTimeString()
					.slice(0, 8);

				const resultStr =
					entry.result && typeof entry.result === "object"
						? JSON.stringify(entry.result)
						: entry.result
							? String(entry.result)
							: undefined;

				// Activity bar / sidepanel card border style
				const cardBorderColor = isEntrySelected && isFocused ? c.borderActive : c.borderDefault;
				const cardBg = isEntrySelected ? c.bgElevated : c.bgSurface;
				const headerBg = isEntrySelected ? c.bgActive : c.bgElevated;

				const outputLine = resultStr
					? t("journal.output", `↳ Output: ${resultStr}`, { summary: resultStr })
					: null;
				const reversalLine = entry.reversalReason
					? t("journal.reversal", `↳ ▲ Reversal: ${entry.reversalReason}`, { reason: entry.reversalReason })
					: null;

				return (
					<box
						key={entry.id}
						flexDirection="column"
						borderStyle="single"
						borderColor={cardBorderColor}
						backgroundColor={cardBg}
						marginBottom={1}
					>
						{/* 1. Card Header Shelf (Tab-Style with Focus Border) */}
						<box
							flexDirection="row"
							height={1}
							backgroundColor={headerBg}
							paddingLeft={1}
							paddingRight={1}
						>
							<TuiStatusBadge status={statusType} variant="solid-glyph" theme={theme} i18n={i18n} />
							<text fg={c.fgDim}> </text>
							<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
								⚡ {entry.macroName}
							</text>
							<text fg={c.fgDim}> </text>
							<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
								L{lineGutter.lineNumText}
							</text>
							<box flexGrow={1} />
							<text fg={isEntrySelected ? c.fgPrimary : c.fgDim} attributes={isEntrySelected ? TextAttributes.BOLD : TextAttributes.DIM}>
								#{entry.fingerprint.slice(0, 10)} · {timeStr}
							</text>
						</box>

						{/* 2. Scratchpad Code Line with Gutter & Vertical Pipe (Deterministic Alignment) */}
						<box flexDirection="row" height={1} paddingLeft={1} paddingRight={1} marginTop={0}>
							<text fg={statusColor} attributes={TextAttributes.BOLD}>
								▎
							</text>
							<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
								{" "}{lineGutter.lineNumText}{" "}
							</text>
							<text fg={c.borderDefault}>│ </text>
							<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
								{entry.rawText}
							</text>
						</box>

						{/* 3. Output or Reversal Continuation Line (Aligned via empty gutter) */}
						{reversalLine ? (
							<box flexDirection="row" height={1} paddingLeft={1} paddingRight={1}>
								<text fg={statusColor} attributes={TextAttributes.BOLD}>
									▎
								</text>
								<text fg="transparent">
									{" "}{emptyGutter.lineNumText}{" "}
								</text>
								<text fg={c.borderDefault}>│ </text>
								<text fg={c.accentPeach} attributes={TextAttributes.BOLD}>
									{reversalLine}
								</text>
							</box>
						) : outputLine ? (
							<box flexDirection="row" height={1} paddingLeft={1} paddingRight={1}>
								<text fg={statusColor} attributes={TextAttributes.BOLD}>
									▎
								</text>
								<text fg="transparent">
									{" "}{emptyGutter.lineNumText}{" "}
								</text>
								<text fg={c.borderDefault}>│ </text>
								<text fg={c.statusSuccess}>
									{outputLine}
								</text>
							</box>
						) : null}
					</box>
				);
			})}
		</box>
	);
}
