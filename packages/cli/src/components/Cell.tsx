import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import { buildMacroRenderSegments } from "../lib/editor/macro-render";

interface CellProps {
	cell: StructuredCell;
	index: number;
	isActive: boolean;
	mode: NotebookEditorMode;
	draftText?: string;
	isSelected?: boolean;
	suggestions?: CellSuggestion[];
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	cursorOffset?: number;
}

const STATUS_COLORS: Record<string, string> = {
	draft: "yellow",
	classified: "blue",
	preview: "cyan",
	pending_commit: "cyan",
	committed: "green",
	failed: "red",
	cancelled: "gray",
	deleted: "gray",
	locked: "magenta",
};

const STATUS_SYMBOLS: Record<string, string> = {
	draft: "○",
	classified: "◌",
	preview: "◌",
	pending_commit: "◎",
	committed: "●",
	failed: "✗",
	cancelled: "—",
	deleted: "—",
	locked: "🔒",
};

function relativeTime(iso: string): string {
	const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function CellComponent({
	cell, index, isActive, mode, draftText, isSelected, suggestions, macroSlots, activeMacroArgumentId, cursorOffset,
}: CellProps) {
	const status = cell.lifecycle.status;
	const displayText = isActive && mode === "INSERT" ? (draftText ?? cell.authored.rawText) : cell.authored.rawText;
	const statusColor = STATUS_COLORS[status] ?? "white";
	const symbol = STATUS_SYMBOLS[status] ?? "?";
	const prefix = isActive ? "▸" : isSelected ? ">" : " ";
	const collection = cell.collection.kind === "workspace" ? ` @ ${cell.collection.collectionId.slice(0, 12)}` : "";
	const diagnostics = cell.diagnostics.filter((item) => item.severity !== "info");

	return (
		<Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor={isActive ? "green" : isSelected ? "magenta" : "gray"} paddingX={1}>
			<Box><Text bold>{prefix}[{String(index + 1).padStart(2, "0")}] {cell.collection.kind}{collection}</Text></Box>
			<Box><Text color={isActive ? "cyan" : "gray"}>{isActive ? "[i] edit [r] run [P] preview [I] info" : ""}</Text></Box>
			<Box flexDirection="column" borderStyle="single" borderColor={isActive ? "cyan" : "gray"} paddingX={1}>
				{isActive && mode === "MACRO" && draftText !== undefined ? (
					<MacroDraftText text={displayText} slots={macroSlots ?? []} activeArgumentId={activeMacroArgumentId} cursorOffset={cursorOffset} showCursor={false} />
				) : isActive && mode === "INSERT" ? (
					<CursorText text={displayText} offset={cursorOffset} />
				) : (
					displayText.split("\n").map((row, rowIndex) => <Text key={rowIndex} bold={isActive}>{row || " "}</Text>)
				)}
				{displayText.length === 0 && <Text color="gray">(empty)</Text>}
				{suggestions?.slice(0, 5).map((suggestion, suggestionIndex) => <Text key={suggestionIndex} dimColor>▸ {suggestion.text}{suggestion.detail ? ` — ${suggestion.detail}` : ""}</Text>)}
			</Box>
			{diagnostics.length > 0 && <Box flexDirection="column" borderStyle="single" borderColor="red" paddingX={1}>{diagnostics.map((diagnostic, diagnosticIndex) => <Text key={diagnosticIndex} color="red">{diagnostic.code}: {diagnostic.message}</Text>)}</Box>}
			<Box marginTop={1}><Text color={statusColor}>{symbol} {status} · revision {cell.lifecycle.revision} · {relativeTime(cell.source.updatedAt)}</Text></Box>
		</Box>
	);
}

function CursorText({ text, offset }: { text: string; offset?: number }) {
	const cursor = Math.max(0, Math.min(offset ?? text.length, text.length));
	return <Text bold>{text.slice(0, cursor)}<Text color="green">█</Text>{text.slice(cursor)}</Text>;
}

function MacroDraftText({ text, slots, activeArgumentId, cursorOffset, showCursor }: { text: string; slots: MacroSlotProjection[]; activeArgumentId?: string; cursorOffset?: number; showCursor?: boolean }) {
	const segments = buildMacroRenderSegments(text, slots, cursorOffset ?? text.length, showCursor ?? false);
	return <Text bold>{segments.map((segment, index) => {
		if (segment.kind === "cursor") return <Text key={index} color="green">{segment.text}</Text>;
		if (segment.kind === "slot") {
			const slot = slots.find((candidate) => candidate.start <= text.indexOf(segment.text) && candidate.end >= text.indexOf(segment.text) + segment.text.length);
			return <Text key={index} inverse color={slot?.status === "locked" ? "magenta" : slot?.argumentId === activeArgumentId ? "yellow" : "cyan"} bold>[{segment.text}]</Text>;
		}
		return <Text key={index}>{segment.text}</Text>;
	})}</Text>;
}
