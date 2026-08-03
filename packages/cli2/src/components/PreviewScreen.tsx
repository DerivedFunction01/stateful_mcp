import type { ParsedItem } from "@stateful-mcp/clinical/parser/schema-parsers";
import type { PreviewCandidate } from "@stateful-mcp/clinical/session/preview-candidate";
import { Box, Text, useInput } from "ink";
import { useState } from "react";

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
	const [showRendered, setShowRendered] = useState(false);

	useInput((input, key) => {
		if (input === "a" || input === "A") {
			onAccept();
			return;
		}
		if (input === "e" || input === "E") {
			onEdit();
			return;
		}
		if (input === "t" || input === "T") {
			setShowRendered((r) => !r);
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
					{" "}
					{showRendered ? "RENDERED" : "PREVIEW"}{" "}
				</Text>
				<Text> </Text>
				<Text color="gray">{candidate.cellId.slice(0, 24)}</Text>
			</Box>

			{/* Divider */}
			<Box>
				<Text color="gray">{"─".repeat(80)}</Text>
			</Box>

			{/* Content */}
			<Box flexGrow={1} flexDirection="column" paddingLeft={1}>
				{items.length === 0 && <Text color="yellow">(no parsed items)</Text>}
				{showRendered
					? renderAsProse(items)
					: items.map((item, i) => (
							<Box key={i} flexDirection="column" marginBottom={1}>
								<Text bold color="cyan">
									[{i + 1}] {item.targetSchema}
								</Text>
								<Box paddingLeft={2} flexDirection="column">
									{Object.entries(item.extractedData).map(([key, value]) => (
										<Box key={key}>
											<Text color="gray">{key}: </Text>
											<Text>{formatValue(value)}</Text>
										</Box>
									))}
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
				<Text bold color="blue">
					{"[T]oggle "}
				</Text>
				<Text color="gray">
					| fingerprint: {candidate.inputFingerprint.slice(0, 24)}
				</Text>
			</Box>
		</Box>
	);
}

function renderAsProse(items: ParsedItem[]) {
	const sections: Record<string, string[]> = {};
	for (const item of items) {
		const lines: string[] = [item.rawText];
		const fields = Object.entries(item.extractedData).filter(
			([, v]) => v !== null && v !== undefined && v !== "",
		);
		if (fields.length > 0) {
			lines.push(
				...fields.map(([key, value]) => `  ${key}: ${formatValue(value)}`),
			);
		}
		if (!sections[item.targetSchema]) sections[item.targetSchema] = [];
		sections[item.targetSchema]!.push(item.rawText);
	}

	return (
		<Box flexDirection="column">
			{Object.entries(sections).map(([schema, texts], i) => (
				<Box key={i} flexDirection="column" marginBottom={1}>
					<Text bold color="green">
						{schema}
					</Text>
					{texts.map((t, j) => (
						<Text key={j} dimColor>
							{"  "}• {t}
						</Text>
					))}
				</Box>
			))}
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
		return value.map((v) => formatValue(v)).join(", ");
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
