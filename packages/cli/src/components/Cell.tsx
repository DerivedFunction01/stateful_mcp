import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box, Text } from "ink";

interface CellProps {
	cell: StructuredCell;
	index: number;
	isActive: boolean;
	isSelected?: boolean;
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

function timestamp(iso: string): string {
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) return iso;
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

export function CellComponent({
	cell,
	index,
	isActive,
	isSelected,
}: CellProps) {
	const status = cell.lifecycle.status;
	const displayText = cell.authored.rawText;
	const statusColor = STATUS_COLORS[status] ?? "white";
	const prefix = isActive ? "▸" : isSelected ? ">" : " ";
	const collection =
		cell.collection.kind === "workspace"
			? ` @ ${cell.collection.collectionId.slice(0, 12)}`
			: "";
	const diagnostics = cell.diagnostics.filter(
		(item) => item.severity !== "info",
	);
	const compactText = displayText.replace(/\s*\n\s*/g, " ");

	return (
		<Box flexDirection="column" paddingLeft={1}>
			<Box>
				<Text bold color={isActive ? "cyan" : undefined}>
					{prefix}[{String(index + 1).padStart(2, "0")}]{" "}
					{timestamp(cell.source.updatedAt)} {cell.collection.kind}
					{collection}
				</Text>
				<Text color="gray"> {compactText || "(empty)"}</Text>
			</Box>
			{diagnostics.length > 0 && (
				<Box flexDirection="column" paddingLeft={5}>
					{diagnostics.map((diagnostic, diagnosticIndex) => (
						<Text key={diagnosticIndex} color="red">
							{diagnostic.code}: {diagnostic.message}
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}
