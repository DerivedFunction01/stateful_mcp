import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import { Box, Text } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import { has, t } from "../lib/shared/i18n";
import { CellComponent } from "./Cell";
import { SOAP_SECTIONS } from "@stateful-mcp/clinical";

interface CellListProps {
	cells: Cell[];
	activeIndex: number;
	mode: EditorMode;
	draftText: string;
	lastEditCellId: string | null;
	visualStart: number;
	visualEnd: number;
	cellSuggestions: CellSuggestion[];
}

type Row =
	| { kind: "header"; section: string }
	| { kind: "cell"; index: number; cell: Cell };

const MAIN_SECTION_ORDER = [...SOAP_SECTIONS];

function buildRows(cells: Cell[]): Row[] {
	const bySection = new Map<string, Cell[]>();
	for (const cell of cells) {
		const section = cell.routing.resolvedSection ?? "";
		if (!bySection.has(section)) bySection.set(section, []);
		bySection.get(section)!.push(cell);
	}

	const orderedSections = [
		// The four main SOAP headers always render, even when empty.
		...MAIN_SECTION_ORDER,
		// Extra (non-main) sections only render if they have cells.
		...Array.from(bySection.keys()).filter(
			(s) => !(MAIN_SECTION_ORDER as readonly string[]).includes(s),
		),
	];

	const rows: Row[] = [];
	const indexMap = new Map<Cell, number>();
	for (let i = 0; i < cells.length; i++) indexMap.set(cells[i]!, i);

	for (const section of orderedSections) {
		rows.push({ kind: "header", section });
		const sectionCells = bySection.get(section);
		for (const cell of sectionCells ?? []) {
			rows.push({ kind: "cell", index: indexMap.get(cell)!, cell });
		}
	}
	return rows;
}

function SectionHeader({ section }: { section: string }) {
	const label =
		section === "" || !has(`section.${section}`)
			? t("section.other")
			: t(`section.${section}`);
	return (
		<Box marginTop={1} marginBottom={1}>
			<Text bold inverse>
				{" "}
				{label}{" "}
			</Text>
		</Box>
	);
}

export function CellList({
	cells,
	activeIndex,
	mode,
	draftText,
	lastEditCellId,
	visualStart,
	visualEnd,
	cellSuggestions,
}: CellListProps) {
	const lo = Math.min(visualStart, visualEnd);
	const hi = Math.max(visualStart, visualEnd);
	const rows = buildRows(cells);

	return (
		<Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
			{cells.length === 0 && (
				<Box paddingLeft={2}>
					<Text>{t("celllist.empty", { key: t("celllist.empty.key") })}</Text>
				</Box>
			)}
			{rows.map((row) => {
				if (row.kind === "header") {
					return (
						<SectionHeader key={`hdr-${row.section}`} section={row.section} />
					);
				}
				const cell = row.cell;
				const i = row.index;
				return (
					<CellComponent
						key={cell.cellId}
						cell={cell}
						index={i}
						isActive={i === activeIndex}
						mode={i === activeIndex ? mode : "NORMAL"}
						draftText={
							i === activeIndex && lastEditCellId === cell.cellId
								? draftText
								: undefined
						}
						isSelected={mode === "VISUAL" && i >= lo && i <= hi}
						suggestions={
							i === activeIndex && mode === "INSERT"
								? cellSuggestions
								: undefined
						}
					/>
				);
			})}
		</Box>
	);
}
