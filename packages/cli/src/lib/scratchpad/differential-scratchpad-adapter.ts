import type {
	CommandSyntaxProfile,
	ConceptLookup,
} from "@stateful-mcp/clinical";
import type { ScratchpadCell } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { WorkspaceOperation } from "@stateful-mcp/clinical/workspaces/workspace-types";
import {
	type DeduplicatedLine,
	deduplicateParsedLines,
	type ParsedDifferentialLine,
	parseShorthandLine,
	resolveShorthandLine,
} from "../workspace/assessment-workspace-view";

export interface DifferentialScratchpadAdapter {
	parse(
		cells: readonly ScratchpadCell[],
		syntaxProfile?: CommandSyntaxProfile,
	): ParsedDifferentialLine[];
	resolve(
		cells: readonly ScratchpadCell[],
		syntaxProfile?: CommandSyntaxProfile,
		conceptLookup?: ConceptLookup,
	): Promise<ParsedDifferentialLine[]>;
	deduplicate(lines: readonly ParsedDifferentialLine[]): DeduplicatedLine[];
	buildOperations(
		lines: readonly DeduplicatedLine[],
		workspaceId: string,
	): WorkspaceOperation[];
}

export function createDifferentialScratchpadAdapter(): DifferentialScratchpadAdapter {
	return {
		parse(cells, syntaxProfile) {
			return invocationCells(cells).map(({ cell, macroId }) =>
				parseShorthandLine(cell.text, syntaxProfile, macroId),
			);
		},
		resolve(cells, syntaxProfile, conceptLookup) {
			return Promise.all(
				invocationCells(cells).map(({ cell, macroId }) =>
					resolveShorthandLine(
						cell.text,
						syntaxProfile,
						conceptLookup,
						macroId,
					),
				),
			);
		},
		deduplicate(lines) {
			return deduplicateParsedLines([...lines]);
		},
		buildOperations(lines, workspaceId) {
			return lines.map(
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
						supportingFindings: p.supportingFindings.map((finding) => ({
							concept: {
								conceptId: finding.conceptId ?? finding.display,
								display: finding.display,
							},
							certainty: "supporting" as const,
						})),
						refutingFindings: p.refutingFindings.map((finding) => ({
							concept: {
								conceptId: finding.conceptId ?? finding.display,
								display: finding.display,
							},
							certainty: "refuting" as const,
						})),
					}) as WorkspaceOperation,
			);
		},
	};
}

function invocationCells(cells: readonly ScratchpadCell[]): Array<{
	cell: ScratchpadCell;
	macroId?: string;
}> {
	return cells.flatMap((cell) => {
		if (cell.pinnedMacroIds.length === 0) return [{ cell }];
		return cell.pinnedMacroIds.map((macroId) => ({ cell, macroId }));
	});
}
