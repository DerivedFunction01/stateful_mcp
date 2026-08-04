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
			<Text bold color="cyan">
				Structured cell {cell.cellId}
			</Text>
			<Text>session: {cell.sessionId}</Text>
			<Text>
				collection: {cell.collection.kind}/{cell.collection.collectionId}
			</Text>
			<Text>status: {cell.lifecycle.status}</Text>
			<Text>revision: {cell.lifecycle.revision}</Text>
			<Text>origin: {cell.source.origin}</Text>
			<Text>created: {cell.source.createdAt}</Text>
			<Text>updated: {cell.source.updatedAt}</Text>
			{cell.execution.planFingerprint && (
				<Text>fingerprint: {cell.execution.planFingerprint}</Text>
			)}
			{cell.execution.transactionId && (
				<Text>transaction: {cell.execution.transactionId}</Text>
			)}
			{cell.diagnostics.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="yellow">
						Diagnostics
					</Text>
					{cell.diagnostics.map((diagnostic) => (
						<Text
							key={`${diagnostic.code}-${diagnostic.message}`}
							color={diagnostic.severity === "error" ? "red" : "yellow"}
						>
							{diagnostic.code}: {diagnostic.message}
						</Text>
					))}
				</Box>
			)}
			{cell.provenance.sourceCellId && (
				<Text>sourceCell: {cell.provenance.sourceCellId}</Text>
			)}
			{cell.provenance.parentCellId && (
				<Text>parentCell: {cell.provenance.parentCellId}</Text>
			)}
			{cell.provenance.macroDefinitionId && (
				<Text>
					macro: {cell.provenance.macroDefinitionId}
					{cell.provenance.macroDefinitionVersion
						? ` v${cell.provenance.macroDefinitionVersion}`
						: ""}
				</Text>
			)}
			{cell.provenance.compatibilitySignature && (
				<Text>
					compatibility:{" "}
					{cell.provenance.compatibilitySignature}
				</Text>
			)}
			{cell.relationships.supersedesCellId && (
				<Box
					flexDirection="column"
					marginTop={1}
				>
					<Text bold color="cyan">
						Relationships
					</Text>
					<Text>
						supersedes:{" "}
						{cell.relationships.supersedesCellId}
					</Text>
				</Box>
			)}
			{cell.relationships.links &&
				cell.relationships.links.length > 0 && (
					<Box
						flexDirection="column"
						marginTop={1}
					>
						<Text bold color="cyan">
							Links
						</Text>
						{cell.relationships.links.map(
							(link, linkIndex) => (
								<Text key={link.linkId}>
									{link.targetSchema}/
									{link.targetField}:{" "}
									{link.targetCellId} (
									{link.mergeStrategy})
								</Text>
							),
						)}
					</Box>
				)}
			<Text color="gray">Esc/Enter to close</Text>
		</Box>
	);
}
