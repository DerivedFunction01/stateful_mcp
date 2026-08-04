import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box, Text, useInput } from "ink";

interface CellInfoPanelProps {
	cell: StructuredCell;
	onClose: () => void;
}

export function CellInfoPanel({ cell, onClose }: CellInfoPanelProps) {
	useInput((_input, key) => {
		if (key.escape || key.return) onClose();
	});
	return (
		<Box flexDirection="column" borderStyle="single" paddingX={1}>
			<Text bold color="cyan">Structured cell {cell.cellId}</Text>
			<Text>session: {cell.sessionId}</Text>
			<Text>collection: {cell.collection.kind}/{cell.collection.collectionId}</Text>
			<Text>status: {cell.lifecycle.status}</Text>
			<Text>revision: {cell.lifecycle.revision}</Text>
			<Text>origin: {cell.source.origin}</Text>
			<Text>created: {cell.source.createdAt}</Text>
			<Text>updated: {cell.source.updatedAt}</Text>
			{cell.execution.planFingerprint && <Text>fingerprint: {cell.execution.planFingerprint}</Text>}
			{cell.execution.transactionId && <Text>transaction: {cell.execution.transactionId}</Text>}
			{cell.diagnostics.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="yellow">Diagnostics</Text>
					{cell.diagnostics.map((diagnostic) => (
						<Text key={`${diagnostic.code}-${diagnostic.message}`} color={diagnostic.severity === "error" ? "red" : "yellow"}>
							{diagnostic.code}: {diagnostic.message}
						</Text>
					))}
				</Box>
			)}
			<Text color="gray">Esc/Enter to close</Text>
		</Box>
	);
}
