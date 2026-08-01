import type { PreviewCandidate } from "@stateful-mcp/clinical/session/preview-candidate";
import { Box, Text, useInput } from "ink";

interface PreviewScreenProps {
	candidate: PreviewCandidate;
	onAccept: () => void;
	onEdit: () => void;
	onCancel: () => void;
}

export function PreviewScreen({
	candidate,
	onAccept,
	onEdit,
	onCancel,
}: PreviewScreenProps) {
	useInput((input, key) => {
		if (input === "a" || input === "A") {
			onAccept();
			return;
		}
		if (input === "e" || input === "E") {
			onEdit();
			return;
		}
		if (key.escape || input === "q" || input === "c" || input === "C") {
			onCancel();
			return;
		}
	});

	const items = candidate.parsedOutput ?? [];

	return (
		<Box flexDirection="column" width="100%" height="100%">
			{/* Header */}
			<Box>
				<Text bold inverse>
					{" "}PREVIEW{" "}
				</Text>
				<Text> </Text>
				<Text color="gray">{candidate.cellId.slice(0, 24)}</Text>
			</Box>

			{/* Divider */}
			<Box>
				<Text color="gray">{"─".repeat(80)}</Text>
			</Box>

			{/* Parsed items */}
			<Box flexGrow={1} flexDirection="column" paddingLeft={1}>
				{items.length === 0 && (
					<Text color="yellow">(no parsed items)</Text>
				)}
				{items.map((item, i) => (
					<Box key={i} flexDirection="column" marginBottom={1}>
						<Text bold color="cyan">
							[{i + 1}] {item.targetSchema}
						</Text>
						<Box paddingLeft={2} flexDirection="column">
							{Object.entries(item.extractedData).map(
								([key, value]) => (
									<Box key={key}>
										<Text color="gray">{key}: </Text>
										<Text>
											{formatValue(value)}
										</Text>
									</Box>
								),
							)}
							{item.rawText && (
								<Box>
									<Text color="gray">raw: </Text>
									<Text dimColor>{item.rawText}</Text>
								</Box>
							)}
						</Box>
					</Box>
				))}
			</Box>

			{/* Divider */}
			<Box>
				<Text color="gray">{"─".repeat(80)}</Text>
			</Box>

			{/* Actions */}
			<Box paddingLeft={1}>
				<Text bold color="green">
					{"[A]ccept "}
				</Text>
				<Text bold color="yellow">
					{"[E]dit "}
				</Text>
				<Text bold color="red">
					{"[C]ancel "}
				</Text>
				<Text color="gray">
					| fingerprint: {candidate.inputFingerprint.slice(0, 24)}
				</Text>
			</Box>
		</Box>
	);
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		return value
			.map((v) => formatValue(v))
			.join(", ");
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return "[Object]";
		}
	}
	return String(value);
}