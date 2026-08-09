import type {
	CommandSyntaxProfile,
	ConceptLookup,
} from "@stateful-mcp/clinical";
import type { ScratchpadCell } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { WorkspaceOperation } from "@stateful-mcp/clinical/workspaces/workspace-types";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import type { DifferentialScratchpadAdapter } from "../lib/scratchpad/differential-scratchpad-adapter";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { useScratchpadCells } from "../lib/scratchpad/use-scratchpad-cells";
import { t } from "../lib/shared/i18n";
import { useDebouncedValue } from "../lib/shared/use-debounced-value";
import type {
	DeduplicatedLine,
	ParsedDifferentialLine,
} from "../lib/workspace/assessment-workspace-view";

interface RapidScratchpadOverlayProps {
	active: boolean;
	initialCells: readonly ScratchpadCell[];
	createCellId(): string;
	onCellsChange(cells: readonly ScratchpadCell[]): void;
	adapter: DifferentialScratchpadAdapter;
	workspaceId: string;
	targetBranchIds: readonly string[];
	targetBranchNames: readonly string[];
	targetScopeLabel: string;
	syntaxProfile?: CommandSyntaxProfile;
	conceptLookup?: ConceptLookup;
	onApplyOperations(
		operations: WorkspaceOperation[],
		targetBranchIds?: readonly string[],
	): Promise<void>;
	onApplySuccess?: (operationCount: number) => void;
	onApplyError?: (message: string) => void;
	onPreviewLines?: (deduped: DeduplicatedLine[]) => void;
	onClose(): void;
	mode?: NotebookEditorMode;
	onModeChange?(mode: NotebookEditorMode): void;
	parseDebounceMs: number;
}

export function RapidScratchpadOverlay({
	active,
	initialCells,
	createCellId,
	onCellsChange,
	adapter,
	workspaceId,
	targetBranchIds,
	targetBranchNames,
	targetScopeLabel,
	syntaxProfile,
	conceptLookup,
	onApplyOperations,
	onApplySuccess,
	onApplyError,
	onPreviewLines,
	onClose,
	mode = "INSERT",
	onModeChange,
	parseDebounceMs,
}: RapidScratchpadOverlayProps) {
	const {
		cells,
		activeCellIndex: activeLineIndex,
		activeCell,
		setActiveCellText,
		duplicateActiveCell,
		moveActiveCell,
		movePreviousCell,
		clearTexts,
	} = useScratchpadCells(initialCells, onCellsChange);
	const [resolvedLines, setResolvedLines] = useState<ParsedDifferentialLine[]>(
		[],
	);
	const [visualRange, setVisualRange] = useState({
		start: activeLineIndex,
		end: activeLineIndex,
	});
	const lines = cells.map((cell) => cell.text);
	const parsedCells = useDebouncedValue(cells, parseDebounceMs);

	const parsedLines = useMemo<ParsedDifferentialLine[]>(() => {
		return adapter.parse(parsedCells, syntaxProfile);
	}, [adapter, parsedCells, syntaxProfile]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await adapter.resolve(
				parsedCells,
				syntaxProfile,
				conceptLookup,
			);
			if (!cancelled) setResolvedLines(res);
		})();
		return () => {
			cancelled = true;
		};
	}, [adapter, parsedCells, syntaxProfile, conceptLookup]);

	const activeParsedLines =
		resolvedLines.length === parsedLines.length ? resolvedLines : parsedLines;

	const deduplicatedLines = useMemo<DeduplicatedLine[]>(() => {
		return adapter.deduplicate(activeParsedLines);
	}, [activeParsedLines, adapter]);

	useEffect(() => {
		onPreviewLines?.(deduplicatedLines);
	}, [deduplicatedLines, onPreviewLines]);

	useInput(
		(input, key) => {
			if (mode === "NORMAL") {
				if (input === "i" && !key.ctrl && !key.meta) {
					onModeChange?.("INSERT");
					return;
				}
				if (key.return) {
					onModeChange?.("INSERT");
					return;
				}
				if (input === "v" && !key.ctrl && !key.meta) {
					setVisualRange({ start: activeLineIndex, end: activeLineIndex });
					onModeChange?.("VISUAL");
					return;
				}
				if (key.upArrow || key.downArrow) {
					moveActiveCell(key.upArrow ? -1 : 1);
					return;
				}
				return;
			}
			if (mode === "VISUAL") {
				if (key.escape) {
					onModeChange?.("NORMAL");
					return;
				}
				if (key.upArrow || key.downArrow) {
					const delta = key.upArrow ? -1 : 1;
					setVisualRange((range) => ({
						...range,
						end: Math.max(0, Math.min(cells.length - 1, range.end + delta)),
					}));
					return;
				}
				if (key.return) {
					const start = Math.min(visualRange.start, visualRange.end);
					const end = Math.max(visualRange.start, visualRange.end);
					const selected = cells
						.slice(start, end + 1)
						.filter((cell) => cell.text.trim().length > 0);
					if (selected.length === 0) return;
					const validOps = adapter.buildOperations(
						adapter.deduplicate(
							resolvedLines.filter((_, index) => index >= start && index <= end),
						),
						workspaceId,
					);
					if (validOps.length === 0) return;
					void onApplyOperations(validOps, targetBranchIds)
						.then(() => {
							clearTexts();
							onModeChange?.("NORMAL");
							onApplySuccess?.(validOps.length);
						})
						.catch((error: unknown) =>
							onApplyError?.(error instanceof Error ? error.message : String(error)),
						);
					return;
				}
				return;
			}
			if (key.escape) {
				onModeChange?.("NORMAL");
				return;
			}

			if (key.return) {
				const validOps: WorkspaceOperation[] = adapter.buildOperations(
					deduplicatedLines,
					workspaceId,
				);

				if (validOps.length === 0) {
					onApplyError?.(t("workspace.scratchpad.noOperations"));
					return;
				}

				void onApplyOperations(validOps, targetBranchIds)
					.then(() => {
						clearTexts();
						setResolvedLines([]);
						if (onApplySuccess) onApplySuccess(validOps.length);
						else onClose();
					})
					.catch((error: unknown) => {
						onApplyError?.(
							error instanceof Error ? error.message : String(error),
						);
					});
				return;
			}

			if (key.tab && !key.meta && !key.ctrl) {
				if (key.shift) return;
				duplicateActiveCell(createCellId());
				return;
			}

			if (key.backspace || key.delete) {
				setActiveCellText((activeCell?.text ?? "").slice(0, -1));
				return;
			}

			if (key.upArrow) {
				moveActiveCell(-1);
				return;
			}

			if (key.downArrow) {
				moveActiveCell(1);
				return;
			}

			if (input.length === 1 && !key.ctrl && !key.meta) {
				setActiveCellText((activeCell?.text ?? "") + input);
			}
		},
		{ isActive: active },
	);

	if (!active) return null;

	return (
		<Box
			flexDirection="column"
			borderStyle="double"
			borderColor="cyan"
			padding={1}
			width="100%"
		>
			<Text bold color="cyan">
				{t("workspace.scratchpadTitle")}
			</Text>
			<Text color="gray">{t("workspace.scratchpadSubtitle")}</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="yellow">
					{t("workspace.scratchpad.applyTo", {
						value: targetScopeLabel,
						count:
							targetBranchIds.length > 0 ? ` (${targetBranchIds.length})` : "",
					})}
				</Text>
				{targetBranchNames.map((name) => (
					<Text key={name} color="gray">
						{name}
					</Text>
				))}
			</Box>

			<Box flexDirection="column" marginTop={1} marginBottom={1}>
				{lines.map((line, idx) => {
					const isActive = idx === activeLineIndex;
					return (
						<Box key={idx}>
							<Text color={isActive ? "yellow" : "gray"}>
								{t("workspace.scratchpad.line", { value: idx + 1 })}
							</Text>
							<Text bold={isActive} color={isActive ? "white" : undefined}>
								{line}
								{isActive ? "█" : ""}
							</Text>
							<Text dimColor>
								{" ["}
								{cells[idx]?.pinnedMacroIds.join(", ") ||
									t("workspace.scratchpad.noPins")}
								{"]"}
							</Text>
						</Box>
					);
				})}
			</Box>

			<Text bold underline color="gray">
				{t("workspace.scratchpadPreviewHeader")}
			</Text>
			<Box flexDirection="column" paddingLeft={1} marginBottom={1}>
				{deduplicatedLines.map(({ parsed, mergedCount }, idx) => {
					return (
						<Box key={idx} flexDirection="column" marginBottom={1}>
							<Box>
								<Text color="cyan">{idx + 1}. </Text>
								<Text color="magenta">
									[{parsed.macroId ?? t("workspace.scratchpad.implicitMacro")}]{" "}
								</Text>
								<Text color="yellow">[{parsed.rawInput}] </Text>
								<Text>➜ {parsed.conceptDisplay} </Text>
								<Text color="gray">
									| {t("workspace.scratchpad.status")}
									<Text
										color={
											parsed.status === "ruled_out"
												? "red"
												: parsed.status === "confirmed"
													? "green"
													: "gray"
										}
									>
										{t(`workspace.scratchpad.status.${parsed.status}`)}
									</Text>
								</Text>
								{mergedCount > 1 && (
									<Text color="magenta">
										· {t("workspace.scratchpad.merged", { value: mergedCount })}
									</Text>
								)}
							</Box>
							{parsed.supportingFindings.map((f, fIdx) => (
								<Box key={`supp-${fIdx}`} paddingLeft={3}>
									<Text color="green">
										├─ +{" "}
										{t("workspace.scratchpad.supporting", { value: f.display })}
									</Text>
									{f.crossBranchEffects?.map((effect, eIdx) => (
										<Text key={eIdx} color="magenta">
											{" "}
											{t("workspace.scratchpad.sideEffect", {
												transition: effect.transition,
												branch: effect.targetBranch,
											})}
										</Text>
									))}
								</Box>
							))}
							{parsed.refutingFindings.map((f, fIdx) => (
								<Box key={`refut-${fIdx}`} paddingLeft={3}>
									<Text color="red">
										└─ ──{" "}
										{t("workspace.scratchpad.refuting", { value: f.display })}
									</Text>
									{f.crossBranchEffects?.map((effect, eIdx) => (
										<Text key={eIdx} color="magenta">
											{" "}
											{t("workspace.scratchpad.sideEffect", {
												transition: effect.transition,
												branch: effect.targetBranch,
											})}
										</Text>
									))}
								</Box>
							))}
						</Box>
					);
				})}
			</Box>

			<Text dimColor>{t("workspace.scratchpadFooter")}</Text>
		</Box>
	);
}
