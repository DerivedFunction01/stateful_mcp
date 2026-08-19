import { TextAttributes } from "@opentui/core";
import { formatJournalGutter } from "../../components/JournalView";
import { translate } from "@stateful-mcp/macro";
import {
	getStatusMeta,
	TuiStatusBadge,
	type TuiStatusType,
} from "../../ui/primitives/TuiBadge";
import { TuiFrame } from "../../ui/primitives/TuiFrame";
import { GlobalThemeRegistry } from "../../ui/theme";
import { createMockWorkspace } from "../mock-workspace";
import type { TuiStory } from "../story-contract";

interface MockJournalEntry {
	readonly id: string;
	readonly status: TuiStatusType;
	readonly macroName: string;
	readonly lineNumber: number;
	readonly fingerprint: string;
	readonly rawText: string;
	readonly time: string;
	readonly resultSummary?: string;
	readonly reversalReason?: string;
}

const ALL_ENTRIES: readonly MockJournalEntry[] = [
	{
		id: "e1",
		status: "committed",
		macroName: "^deploy",
		lineNumber: 1,
		fingerprint: "a9f8b2c4189e37ad8b",
		rawText: "^deploy service=api env=production",
		time: "14:22:05",
		resultSummary: "2 instances scheduled [healthy]",
	},
	{
		id: "e2",
		status: "reversed",
		macroName: "^retail.checkout",
		lineNumber: 2,
		fingerprint: "3bc8910fae78291cd4",
		rawText: "^retail.checkout cartId=901 amount=$85.00",
		time: "14:25:12",
		reversalReason: "Payment gateway timeout (auto-compensated)",
	},
	{
		id: "e3",
		status: "committed",
		macroName: "^calc",
		lineNumber: 3,
		fingerprint: "7fe20918ca1280bb01",
		rawText: '^calc expr="128 * 1024 / 4"',
		time: "14:28:40",
		resultSummary: "32768",
	},
	{
		id: "e4",
		status: "superseded",
		macroName: "^config.set",
		lineNumber: 14,
		fingerprint: "21dd8901caef881200",
		rawText: "^config.set timeoutMs=5000",
		time: "14:30:02",
		resultSummary: "Overridden by line 18",
	},
];

const mockWsEs = createMockWorkspace({ locale: "es" });

export const journalStory: TuiStory = {
	id: "journal",
	title: "Journal & Audit History",
	category: "Views",
	states: [
		"focused-navigation",
		"all-transactions",
		"with-reversals",
		"spanish-i18n",
		"empty-journal",
	],
	render(context) {
		const stateId = context.stateId;
		const width = Math.min(68, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		const isSpanish = stateId === "spanish-i18n";
		const i18n = isSpanish ? mockWsEs.workspace.i18n : undefined;
		const isEmpty = stateId === "empty-journal";

		const title = translate(i18n, "journal.title");
		const emptyMsg = translate(i18n, "journal.empty");

		if (isEmpty) {
			return (
				<TuiFrame
					title={title}
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{emptyMsg}
						</text>
					</box>
				</TuiFrame>
			);
		}

		const entries =
			stateId === "with-reversals"
				? ALL_ENTRIES.filter((e) => e.status === "reversed")
				: ALL_ENTRIES;

		const selectedIndex = stateId === "focused-navigation" ? 1 : 0;
		const isNavigating = stateId === "focused-navigation";

		// Compute dynamic uniform gutter width for all entries in the feed
		const maxLineNum = Math.max(1, ...entries.map((e) => e.lineNumber));
		const gutterWidth = Math.max(2, String(maxLineNum).length);

		const countLabel =
			entries.length === 1
				? translate(i18n, "journal.entry")
				: translate(i18n, "journal.entries");
		const hintActions = translate(i18n, "journal.hint.actions");
		const historyLabel = translate(i18n, "journal.historyLabel");
		const activeSelectionLabel = translate(i18n, "journal.activeSelection", {
			n: selectedIndex + 1,
		});

		return (
			<TuiFrame
				title={`${title} (${entries.length} ${countLabel})`}
				width={width}
				showBounds={context.showBounds}
				theme={theme}
			>
				<box flexDirection="column" padding={1}>
					{/* Navigation Hint Header */}
					<box height={1} marginBottom={1} flexDirection="row">
						<text
							fg={isNavigating ? c.accentPrimary : c.fgSecondary}
							attributes={TextAttributes.BOLD}
						>
							{isNavigating ? activeSelectionLabel : historyLabel}
						</text>
						<box flexGrow={1} />
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{hintActions}
						</text>
					</box>

					{entries.map((entry, idx) => {
						const isEntrySelected = idx === selectedIndex;
						const meta = getStatusMeta(entry.status);
						const statusColor = c[meta.colorKey];
						const lineGutter = formatJournalGutter(
							entry.lineNumber,
							gutterWidth,
						);
						const emptyGutter = formatJournalGutter(null, gutterWidth);

						// Border color: bright borderActive on selected item, subtle on unselected
						const borderColor = isEntrySelected
							? c.borderActive
							: c.borderDefault;
						const cardBg = isEntrySelected ? c.bgElevated : c.bgSurface;
						const headerBg = isEntrySelected ? c.bgActive : c.bgElevated;

						return (
							<box
								key={entry.id}
								flexDirection="column"
								borderStyle="single"
								borderColor={borderColor}
								backgroundColor={cardBg}
								marginBottom={1}
							>
								{/* 1. Elevated Card Header with Status Badge */}
								<box
									flexDirection="row"
									height={1}
									backgroundColor={headerBg}
									paddingLeft={1}
									paddingRight={1}
								>
									<TuiStatusBadge
										status={entry.status}
										variant="solid-glyph"
										theme={theme}
										i18n={i18n}
									/>
									<text fg={c.fgDim}> </text>
									<box
										backgroundColor={
											isEntrySelected ? c.bgElevated : c.bgSurface
										}
										paddingLeft={1}
										paddingRight={1}
									>
										<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
											⚡ {entry.macroName}
										</text>
									</box>
									<text fg={c.fgDim}> </text>
									<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
										L{lineGutter.lineNumText}
									</text>
									<box flexGrow={1} />
									<text
										fg={isEntrySelected ? c.fgPrimary : c.fgDim}
										attributes={
											isEntrySelected ? TextAttributes.BOLD : TextAttributes.DIM
										}
									>
										#{entry.fingerprint.slice(0, 10)} · {entry.time}
									</text>
								</box>

								{/* 2. Scratchpad Code Line with Gutter & Vertical Pipe (Deterministic Alignment) */}
								<box
									flexDirection="row"
									height={1}
									paddingLeft={1}
									paddingRight={1}
									marginTop={0}
								>
									<text fg={statusColor} attributes={TextAttributes.BOLD}>
										▎
									</text>
									<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
										{" "}
										{lineGutter.lineNumText}{" "}
									</text>
									<text fg={c.borderDefault}>│ </text>
									<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
										{entry.rawText}
									</text>
								</box>

								{/* 3. Output or Reversal Continuation Line (i18n) */}
								{entry.reversalReason ? (
									<box
										flexDirection="row"
										height={1}
										paddingLeft={1}
										paddingRight={1}
									>
										<text fg={statusColor} attributes={TextAttributes.BOLD}>
											▎
										</text>
										<text fg="transparent"> {emptyGutter.lineNumText} </text>
										<text fg={c.borderDefault}>│ </text>
										<text fg={c.accentPeach} attributes={TextAttributes.BOLD}>
											{translate(i18n, "journal.reversal", {
												reason: entry.reversalReason,
											})}
										</text>
									</box>
								) : entry.resultSummary ? (
									<box
										flexDirection="row"
										height={1}
										paddingLeft={1}
										paddingRight={1}
									>
										<text fg={statusColor} attributes={TextAttributes.BOLD}>
											▎
										</text>
										<text fg="transparent"> {emptyGutter.lineNumText} </text>
										<text fg={c.borderDefault}>│ </text>
										<text fg={c.statusSuccess}>
											{translate(i18n, "journal.output", {
												summary: entry.resultSummary,
											})}
										</text>
									</box>
								) : null}
							</box>
						);
					})}
				</box>
			</TuiFrame>
		);
	},
};
