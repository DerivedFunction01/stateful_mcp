import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";

interface CellProps {
	cell: StructuredCell;
	index: number;
	isActive: boolean;
	mode: NotebookEditorMode;
	draftText?: string;
	isSelected?: boolean;
	suggestions?: CellSuggestion[];
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
	cell,
	index,
	isActive,
	mode,
	draftText,
	isSelected,
	suggestions,
}: CellProps) {
	const status = cell.lifecycle.status;
	const displayText = isActive && mode === "INSERT" ? (draftText ?? cell.authored.rawText) : cell.authored.rawText;
	const statusColor = STATUS_COLORS[status] ?? "white";
	const symbol = STATUS_SYMBOLS[status] ?? "?";
	const prefix = isActive ? "▸" : isSelected ? ">" : " ";
	const collection =
		cell.collection.kind === "workspace"
			? ` @ ${cell.collection.collectionId.slice(0, 12)}`
			: "";
	const diagnostics = cell.diagnostics.filter((item) => item.severity !== "info");

	return (
		<Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor={isActive ? "green" : isSelected ? "magenta" : "gray"} paddingX={1}>
			<Box>
				<Text bold>
					{prefix}[{String(index + 1).padStart(2, "0")}] {cell.collection.kind}{collection}
				</Text>
			</Box>
			<Box>
				<Text color={isActive ? "cyan" : "gray"}>
					{isActive ? "[i] edit [r] run [P] preview [I] info" : ""}
				</Text>
			</Box>
			<Box flexDirection="column" borderStyle="single" borderColor={isActive ? "cyan" : "gray"} paddingX={1}>
				{displayText.split("\n").map((row, rowIndex) => (
					<Text key={rowIndex} bold={isActive}>{row || " "}</Text>
				))}
				{displayText.length === 0 && <Text color="gray">(empty)</Text>}
				{suggestions?.slice(0, 5).map((suggestion, suggestionIndex) => (
					<Text key={suggestionIndex} dimColor>▸ {suggestion.text}{suggestion.detail ? ` — ${suggestion.detail}` : ""}</Text>
				))}
			</Box>
			{diagnostics.length > 0 && (
				<Box flexDirection="column" borderStyle="single" borderColor="red" paddingX={1}>
					{diagnostics.map((diagnostic, diagnosticIndex) => (
						<Text key={diagnosticIndex} color="red">{diagnostic.code}: {diagnostic.message}</Text>
					))}
				</Box>
			)}
			<Box marginTop={1}>
				<Text color={statusColor}>
					{symbol} {status} · revision {cell.lifecycle.revision} · {relativeTime(cell.source.updatedAt)}
				</Text>
			</Box>
		</Box>
	);
}
