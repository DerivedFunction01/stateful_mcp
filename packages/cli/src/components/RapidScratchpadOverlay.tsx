import type { CommandSyntaxProfile, ConceptLookup } from "@stateful-mcp/clinical";
import type { WorkspaceOperation } from "@stateful-mcp/clinical/workspaces/workspace-types";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { t } from "../lib/shared/i18n";
import {
	type DeduplicatedLine,
	deduplicateParsedLines,
	type ParsedDifferentialLine,
	parseShorthandLine,
	resolveShorthandLine,
} from "../lib/workspace/assessment-workspace-view";

interface RapidScratchpadOverlayProps {
	workspaceId: string;
	syntaxProfile?: CommandSyntaxProfile;
	conceptLookup?: ConceptLookup;
	onApplyOperations(operations: WorkspaceOperation[]): Promise<void>;
	onClose(): void;
}

export function RapidScratchpadOverlay({
	workspaceId,
	syntaxProfile,
	conceptLookup,
	onApplyOperations,
	onClose,
}: RapidScratchpadOverlayProps) {
	const [lines, setLines] = useState<string[]>([""]);
	const [activeLineIndex, setActiveLineIndex] = useState(0);
	const [resolvedLines, setResolvedLines] = useState<ParsedDifferentialLine[]>([]);

	const parsedLines = useMemo<ParsedDifferentialLine[]>(() => {
		return lines.map((line) => parseShorthandLine(line, syntaxProfile));
	}, [lines, syntaxProfile]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await Promise.all(
				lines.map((line) =>
					resolveShorthandLine(line, syntaxProfile, conceptLookup),
				),
			);
			if (!cancelled) setResolvedLines(res);
		})();
		return () => {
			cancelled = true;
		};
	}, [lines, syntaxProfile, conceptLookup]);

	const activeParsedLines = resolvedLines.length === lines.length ? resolvedLines : parsedLines;

	const deduplicatedLines = useMemo<DeduplicatedLine[]>(() => {
		return deduplicateParsedLines(activeParsedLines);
	}, [activeParsedLines]);

	useInput((input, key) => {
		if (key.escape) {
			onClose();
			return;
		}

		if (key.return) {
			const validOps: WorkspaceOperation[] = deduplicatedLines.map(
				({ parsed: p }) =>
					({
						kind: "create_branch",
						workspaceId,
						name: p.conceptDisplay,
						concept: {
							conceptId: p.conceptId ?? p.rawInput.trim(),
							display: p.conceptDisplay,
						},
						initialStatus: p.status,
						supportingFindings: p.supportingFindings,
						refutingFindings: p.refutingFindings,
					}) as any,
			);

			if (validOps.length > 0) {
				void onApplyOperations(validOps).then(() => onClose());
			} else {
				onClose();
			}
			return;
		}

		if (key.tab) {
			setLines((prev) => {
				const next = [...prev];
				next.splice(activeLineIndex + 1, 0, "");
				return next;
			});
			setActiveLineIndex((idx) => idx + 1);
			return;
		}

		if (key.backspace || key.delete) {
			const currentLine = lines[activeLineIndex] ?? "";
			if (currentLine.length === 0 && lines.length > 1) {
				setLines((prev) => prev.filter((_, idx) => idx !== activeLineIndex));
				setActiveLineIndex((idx) => Math.max(0, idx - 1));
				return;
			}
			setLines((prev) => {
				const next = [...prev];
				next[activeLineIndex] = (next[activeLineIndex] ?? "").slice(0, -1);
				return next;
			});
			return;
		}

		if (key.upArrow) {
			setActiveLineIndex((idx) => Math.max(0, idx - 1));
			return;
		}

		if (key.downArrow) {
			setActiveLineIndex((idx) => Math.min(lines.length - 1, idx + 1));
			return;
		}

		if (input.length === 1 && !key.ctrl && !key.meta) {
			setLines((prev) => {
				const next = [...prev];
				next[activeLineIndex] = (next[activeLineIndex] ?? "") + input;
				return next;
			});
		}
	});

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
			<Text color="gray">
				{t("workspace.scratchpadSubtitle", {
					ex1: "pe",
					ex2: "pna",
					ex3: "r/o acs",
				})}
			</Text>

			<Box flexDirection="column" marginTop={1} marginBottom={1}>
				{lines.map((line, idx) => {
					const isActive = idx === activeLineIndex;
					return (
						<Box key={idx}>
							<Text color={isActive ? "yellow" : "gray"}>Line {idx + 1}: </Text>
							<Text bold={isActive} color={isActive ? "white" : undefined}>
								{line}
								{isActive ? "█" : ""}
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
								<Text color="yellow">[{parsed.rawInput}] </Text>
								<Text>➜ {parsed.conceptDisplay} </Text>
								<Text color="gray">
									| STATUS:{" "}
									<Text
										color={
											parsed.status === "ruled_out"
												? "red"
												: parsed.status === "confirmed"
													? "green"
													: "gray"
										}
									>
										{parsed.status}
									</Text>
								</Text>
								{mergedCount > 1 && (
									<Text color="magenta"> · (merged {mergedCount} lines)</Text>
								)}
							</Box>
							{parsed.supportingFindings.map((f, fIdx) => (
								<Box key={`supp-${fIdx}`} paddingLeft={3}>
									<Text color="green">├─ + {f.display}</Text>
								</Box>
							))}
							{parsed.refutingFindings.map((f, fIdx) => (
								<Box key={`refut-${fIdx}`} paddingLeft={3}>
									<Text color="red">└─ ── {f.display}</Text>
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
