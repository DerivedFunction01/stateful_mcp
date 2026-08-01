import type { Cell } from "@stateful-mcp/clinical/session/cell";
import { Box, Text } from "ink";
import type { EditorMode } from "../lib/keymap";

interface CellProps {
	cell: Cell;
	index: number;
	isActive: boolean;
	mode: EditorMode;
	draftText?: string;
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
}: CellProps) {
	const prefix = isActive ? "▸" : " ";
	const ordinal = String(index + 1).padStart(2, "0");
	const statusColor =
		STATUS_COLORS[cell.status] ?? "white";
	const symbol = STATUS_SYMBOLS[cell.status] ?? "?";

	const displayText =
		isActive && mode === "INSERT"
			? draftText ?? cell.rawInput
			: cell.rawInput;

	const statusLine =
		cell.status === "draft"
			? "draft"
			: cell.status === "committed"
				? `${cell.routing.targetSchema ?? "?"} · committed`
				: cell.status === "error"
					? `error: ${cell.errorMessage ?? "unknown"}`
					: cell.status;

	return (
		<Box flexDirection="column" marginBottom={0}>
			<Box>
				<Text bold={isActive}>
					{prefix}[{ordinal}]{" "}
					<Text color="cyan">({cell.mode})</Text>{" "}
					{displayText}
				</Text>
			</Box>
			<Box marginLeft={6}>
				<Text color={statusColor}>
					{symbol} {statusLine}
				</Text>
			</Box>
		</Box>
	);
}