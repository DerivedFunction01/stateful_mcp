import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box, Text } from "ink";

export function HistoryDetailPanel({ cell }: { cell: StructuredCell }) {
	const macro = cell.authored.finalizedMacro;
	return (
		<Box flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				History detail
			</Text>
			<Text>Text: {cell.authored.rawText}</Text>
			<Text>Status: {cell.lifecycle.status}</Text>
			<Text>Revision: {cell.lifecycle.revision}</Text>
			{macro && (
				<Box flexDirection="column" marginTop={1}>
					<Text>Macro: {macro.macroDefinitionId}</Text>
					<Text>Version: {macro.macroDefinitionVersion}</Text>
					<Text>Fingerprint: {macro.fingerprint}</Text>
					<Text>Bindings:</Text>
					{macro.bindings.map((binding) => (
						<Text key={`${binding.argumentId}-${binding.start}`}>
							{binding.name} = {binding.rawValue}
						</Text>
					))}
					{macro.diagnostics.map((diagnostic) => (
						<Text key={diagnostic.message} color="yellow">
							{diagnostic.message}
						</Text>
					))}
					{macro.naturalPreview?.text && (
						<Text>Preview: {macro.naturalPreview.text}</Text>
					)}
					{macro.machinePreview && (
						<Text>Execution preview: {macro.machinePreview.status}</Text>
					)}
					{macro.plan.generatedCells.length > 0 && (
						<Text>
							Generated:{" "}
							{macro.plan.generatedCells.map((item) => item.cellRef).join(", ")}
						</Text>
					)}
				</Box>
			)}
			{cell.execution.transactionId && (
				<Text>Transaction: {cell.execution.transactionId}</Text>
			)}
			{cell.execution.reversalTransactionId && (
				<Text>Reversal: {cell.execution.reversalTransactionId}</Text>
			)}
			{cell.diagnostics.map((diagnostic) => (
				<Text key={diagnostic.code + diagnostic.message} color="red">
					{diagnostic.code}: {diagnostic.message}
				</Text>
			))}
		</Box>
	);
}
