import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import { Box, Text } from "ink";

interface CellProps {
	cell: Cell;
	index: number;
	isActive: boolean;
	mode: EditorMode;
	draftText?: string;
	isSelected?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
	draft: "yellow",
	parsing: "blue",
	pending_commit: "cyan",
	committed: "green",
	error: "red",
	deleted: "gray",
	locked: "magenta",
};

const STATUS_SYMBOLS: Record<string, string> = {
	draft: "○",
	parsing: "◌",
	pending_commit: "◎",
	committed: "●",
	error: "✗",
	deleted: "—",
	locked: "🔒",
};

export function CellComponent({
	cell,
	index,
	isActive,
	mode,
	draftText,
	isSelected,
}: CellProps) {
	const prefix = isActive ? "▸" : isSelected ? ">" : " ";
	const ordinal = String(index + 1).padStart(2, "0");
	const statusColor = STATUS_COLORS[cell.status] ?? "white";
	const symbol = STATUS_SYMBOLS[cell.status] ?? "?";

	const displayText =
		isActive && mode === "INSERT"
			? (draftText ?? cell.rawInput)
			: cell.rawInput;

	const statusLine = (() => {
		switch (cell.status) {
			case "draft":
				return [`○ draft`, cell.routing.targetSchema ? `schema:${cell.routing.targetSchema}` : null, cell.routing.resolvedSection ? `section:${cell.routing.resolvedSection}` : null, cell.workspaceId ? `ws:${cell.workspaceId.slice(0, 12)}` : null]
					.filter(Boolean)
					.join(" · ");
			case "committed":
				return [`● committed`, cell.routing.targetSchema ?? "", cell.routing.resolvedSection ? `section:${cell.routing.resolvedSection}` : null, cell.workspaceId ? `ws:${cell.workspaceId.slice(0, 12)}` : null]
					.filter(Boolean)
					.join(" · ");
			case "error":
				return `✗ ${cell.errorMessage ?? "unknown"}`;
			default:
				return `${symbol} ${cell.status}`;
		}
	})();

	return (
		<Box flexDirection="column" marginBottom={0}>
			<Box>
				{isSelected ? (
					<Text inverse bold={isActive}>
						{prefix}[{ordinal}] <Text color="cyan">({cell.mode})</Text>{" "}
						{displayText}
					</Text>
				) : (
					<Text bold={isActive}>
						{prefix}[{ordinal}] <Text color="cyan">({cell.mode})</Text>{" "}
						{displayText}
					</Text>
				)}
			</Box>
			<Box marginLeft={6}>
				<Text color={statusColor}>{statusLine}</Text>
			</Box>
		</Box>
	);
}