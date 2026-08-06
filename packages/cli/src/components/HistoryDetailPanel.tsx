import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box, Text } from "ink";

export function HistoryDetailPanel({ cell }: { cell: StructuredCell }) {
	const macro = cell.authored.finalizedMacro;
	const diagnostics = [
		...(macro?.diagnostics ?? []).map((diagnostic) => ({
			key: `macro-${diagnostic.code}-${diagnostic.message}`,
			message: diagnostic.message,
			color: "yellow" as const,
		})),
		...cell.diagnostics.map((diagnostic) => ({
			key: `cell-${diagnostic.code}-${diagnostic.message}`,
			message: `${diagnostic.code}: ${diagnostic.message}`,
			color: "red" as const,
		})),
	];

	return (
		<Box flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				History detail
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Authored text</Text>
				<Text wrap="wrap">{cell.authored.rawText || "(empty)"}</Text>
			</Box>
			{macro && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Macro</Text>
					<Text>{macro.macroDefinitionId}</Text>
					<Text>Version: {macro.macroDefinitionVersion}</Text>
					<Text wrap="wrap">Fingerprint: {macro.fingerprint}</Text>

					<Text bold>Bindings</Text>
					{macro.bindings.length > 0 ? (
						macro.bindings.map((binding) => (
							<Text key={`${binding.argumentId}-${binding.start}`} wrap="wrap">
								{binding.name} = {binding.rawValue}
							</Text>
						))
					) : (
						<Text color="gray">none</Text>
					)}

					{macro.naturalPreview?.text && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Preview text</Text>
							<Text wrap="wrap">{macro.naturalPreview.text}</Text>
							{macro.naturalPreview.missing.length > 0 && (
								<Text color="yellow" wrap="wrap">
									Missing: {macro.naturalPreview.missing.join(", ")}
								</Text>
							)}
							{macro.naturalPreview.invalid.length > 0 && (
								<Text color="yellow" wrap="wrap">
									Invalid: {macro.naturalPreview.invalid.join(", ")}
								</Text>
							)}
						</Box>
					)}

					{macro.machinePreview && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Execution preview</Text>
							{macro.machinePreview.rendered?.lines.map((line) => (
								<Text key={line} wrap="wrap">
									{line}
								</Text>
							))}
							{macro.machinePreview.diagnostics.map((diagnostic) => (
								<Text key={diagnostic} color="yellow" wrap="wrap">
									{diagnostic}
								</Text>
							))}
						</Box>
					)}

					{macro.plan.generatedCells.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Generated cells</Text>
							{macro.plan.generatedCells.map((item) => (
								<Text key={item.cellRef}>{item.cellRef}</Text>
							))}
						</Box>
					)}
				</Box>
			)}
			{diagnostics.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Diagnostics</Text>
					{diagnostics.map((diagnostic) => (
						<Text key={diagnostic.key} color={diagnostic.color} wrap="wrap">
							{diagnostic.message}
						</Text>
					))}
				</Box>
			)}
			{(cell.execution.transactionId ||
				cell.execution.reversalTransactionId) && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>References</Text>
					{cell.execution.transactionId && (
						<Text wrap="wrap">Transaction: {cell.execution.transactionId}</Text>
					)}
					{cell.execution.reversalTransactionId && (
						<Text wrap="wrap">
							Reversal: {cell.execution.reversalTransactionId}
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}
