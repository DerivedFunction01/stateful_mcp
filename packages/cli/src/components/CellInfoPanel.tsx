import type { Cell } from "@stateful-mcp/clinical/session/cell";
import { Box, Text } from "ink";

interface CellInfoPanelProps {
	cell: Cell;
	onClose: () => void;
}

export function CellInfoPanel({ cell }: CellInfoPanelProps) {
	const section = cell.routing.resolvedSection ?? "—";
	const schema =
		cell.routing.targetSchema ?? cell.routing.resolvedSchema ?? "—";
	const workspace =
		cell.collection.kind === "workspace" ? cell.collection.collectionId : "—";
	const branch = cell.routing.branchId ?? "—";
	const parent = cell.parentCellId ?? "—";
	const link = cell.linkTarget
		? `${cell.linkTarget.targetSchema}::${cell.linkTarget.targetCellId}`
		: "—";

	const metadataEntries = cell.metadata
		? Object.entries(cell.metadata).map(([k, v]) => (
				<Box key={k}>
					<Text>{`  ${k}: `}</Text>
					<Text dimColor>
						{typeof v === "object" ? JSON.stringify(v) : String(v)}
					</Text>
				</Box>
			))
		: null;

	const parsedFields = cell.parsedOutput
		? cell.parsedOutput.flatMap((item, i) =>
				Object.entries(item.extractedData).map(([key, value]) => (
					<Box key={`${i}-${key}`}>
						<Text>
							{"  "}
							<Text color="cyan">{key}</Text>
							<Text>: {String(value ?? "—")}</Text>
						</Text>
					</Box>
				)),
			)
		: null;

	return (
		<Box flexDirection="column" paddingLeft={2} paddingTop={1}>
			<Box>
				<Text bold inverse>
					{" "}
					CELL INFO{" "}
				</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text>cellId {cell.cellId}</Text>
				<Text>session {cell.sessionId}</Text>
				<Text>mode {cell.mode}</Text>
				<Text>status {cell.status}</Text>
				{cell.updatedAt && <Text>updated {cell.updatedAt}</Text>}
				{cell.lockedAt && <Text>locked {cell.lockedAt}</Text>}
				<Text>section {section}</Text>
				<Text>schema {schema}</Text>
				<Text>workspace {workspace}</Text>
				<Text>branch {branch}</Text>
				<Text>parent {parent}</Text>
				<Text>link {link}</Text>
				{cell.narrativeTarget && <Text>narrative {cell.narrativeTarget}</Text>}
			</Box>
			{metadataEntries && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Metadata:</Text>
					{metadataEntries}
				</Box>
			)}
			{parsedFields && parsedFields.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Parsed fields:</Text>
					{parsedFields}
				</Box>
			)}
			<Box marginTop={1}>
				<Text color="gray">Press I or :info to close</Text>
			</Box>
		</Box>
	);
}
