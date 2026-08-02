import type { CellInterpretationSummary } from "@stateful-mcp/clinical/session/cell-interpretation-summary";
import { Box, Text, useInput } from "ink";

interface CellInfoPanelProps {
	summary: CellInterpretationSummary;
	onClose: () => void;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "—";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function CellInfoPanel({ summary, onClose }: CellInfoPanelProps) {
	useInput((input, key) => {
		if (key.escape || input === "i" || input === "I" || input === "q") {
			onClose();
		}
	});

	return (
		<Box flexDirection="column" paddingLeft={2} paddingTop={1}>
			<Box>
				<Text bold inverse>
					{" "}
					CELL INSPECTOR{" "}
				</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Source</Text>
				<Text> {summary.rawInput || "—"}</Text>
				<Text dimColor> mode: {summary.mode}</Text>
				<Text dimColor> status: {summary.status}</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Routing</Text>
				<Text> scope: {summary.routing.scope}</Text>
				<Text> section: {summary.routing.section ?? "—"}</Text>
				<Text>
					{"  "}schema:{" "}
					{summary.routing.targetSchema ??
						summary.routing.resolvedSchema ??
						"—"}
				</Text>
				{summary.routing.branchId && (
					<Text> branch: {summary.routing.branchId}</Text>
				)}
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Interpretation</Text>
				{summary.items.length === 0 && <Text dimColor> (no parsed items)</Text>}
				{summary.items.map((item, itemIndex) => (
					<Box key={`${item.targetSchema}-${itemIndex}`} flexDirection="column">
						<Text color="cyan">
							{" "}
							[{itemIndex + 1}] {item.targetSchema}
						</Text>
						{item.fields.length === 0 && (
							<Text dimColor> (no extracted fields)</Text>
						)}
						{item.fields.map((field) => (
							<Text key={`${itemIndex}-${field.path}`}>
								{"    "}
								{field.path}: {formatValue(field.value)}
								{field.state === "unresolved" ? " (unresolved)" : ""}
							</Text>
						))}
					</Box>
				))}
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Diagnostics</Text>
				{summary.diagnostics.error && (
					<Text color="red">
						{"  "}! {summary.diagnostics.error.message}
					</Text>
				)}
				{summary.diagnostics.confidence.state === "available" && (
					<Text>
						{"  "}confidence: {summary.diagnostics.confidence.level} (
						{summary.diagnostics.confidence.score.toFixed(2)})
					</Text>
				)}
				{summary.diagnostics.confidence.state === "unavailable" && (
					<Text dimColor> confidence: unavailable</Text>
				)}
				<Text dimColor> alternatives: {summary.diagnostics.alternatives}</Text>
				<Text dimColor> validation: {summary.diagnostics.validation}</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Raw source</Text>
				<Text dimColor> {summary.rawInput || "—"}</Text>
			</Box>
			<Box marginTop={1}>
				<Text color="gray">Press I, Esc, or q to close</Text>
			</Box>
		</Box>
	);
}
