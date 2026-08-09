import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type {
	SetupSourceDocument,
	SetupValidationResult,
} from "@stateful-mcp/clinical";
import { validateSetupSource } from "@stateful-mcp/clinical";

type SetupStage = "fundamentals" | "document" | "blocks" | "macros" | "review";
const STAGES: SetupStage[] = ["fundamentals", "document", "blocks", "macros", "review"];

export function SetupWorkspace({
	source,
	onChange,
	onSave,
	onExit,
	validation,
}: {
	source: SetupSourceDocument;
	onChange(source: SetupSourceDocument): void;
	onSave(): void;
	onExit(): void;
	validation?: SetupValidationResult;
}) {
	const [stage, setStage] = useState<SetupStage>("fundamentals");
	const [field, setField] = useState<"date" | "measurement">("date");
	const [draft, setDraft] = useState(() => source.primitiveProfile.dateExamples[0] ?? "");
	const currentIndex = STAGES.indexOf(stage);
	const result = useMemo(
		() => validation ?? validateSetupSource(source),
		[source, validation],
	);

	useInput((input, key) => {
		if (key.escape) return onExit();
		if (key.leftArrow) {
			setStage(STAGES[Math.max(0, currentIndex - 1)]!);
			return;
		}
		if (key.rightArrow || key.tab) {
			setStage(STAGES[Math.min(STAGES.length - 1, currentIndex + 1)]!);
			return;
		}
		if (key.return) {
			if (stage === "fundamentals" && draft.trim()) {
				const profile = source.primitiveProfile;
				onChange({
					...source,
					primitiveProfile: {
						...profile,
						dateExamples:
							field === "date"
								? [...profile.dateExamples.filter(Boolean), draft.trim()]
								: profile.dateExamples,
						timeExamples:
							field === "measurement"
								? [...profile.timeExamples.filter(Boolean), draft.trim()]
								: profile.timeExamples,
						measurementExamples:
							field === "measurement"
								? [...profile.measurementExamples.filter(Boolean), draft.trim()]
								: profile.measurementExamples,
					},
					updatedAt: new Date().toISOString(),
				});
				setDraft("");
				setField(field === "date" ? "measurement" : "date");
				return;
			}
			if (stage === "review") return onSave();
			setStage(STAGES[Math.min(STAGES.length - 1, currentIndex + 1)]!);
			return;
		}
		if (key.backspace || key.delete) {
			setDraft((value) => value.slice(0, -1));
			return;
		}
		if (input && stage === "fundamentals") setDraft((value) => value + input);
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box justifyContent="space-between">
				<Text bold>Clinical setup</Text>
				<Text dimColor>Esc exit  ←/→ or Tab navigate  Enter continue</Text>
			</Box>
			<Box marginTop={1}>
				{STAGES.map((item, index) => (
					<Text key={item} color={item === stage ? "cyan" : undefined}>
						{index < currentIndex ? "✓" : index === currentIndex ? "→" : "○"} {item} {index < STAGES.length - 1 ? "  " : ""}
					</Text>
				))}
			</Box>
			{stage === "fundamentals" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Shared input conventions</Text>
					<Text>Define examples before concepts or macros.</Text>
					<Text color="yellow">{field === "date" ? "Date example" : "Measurement example"}: {draft || "type an example"}</Text>
					<Text dimColor>
						{field === "date" ? "Example: 01/31/2026" : "Example: 20 cm"}
					</Text>
					<Text>Dates: {source.primitiveProfile.dateExamples.join(", ") || "not configured"}</Text>
					<Text>Measurements: {source.primitiveProfile.measurementExamples.join(", ") || "not configured"}</Text>
				</Box>
			)}
			{stage === "document" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Document placements</Text>
					<Text dimColor>Select reusable schemas at document paths; fields are not duplicated.</Text>
					{source.placements.length === 0 ? <Text color="yellow">No placements configured</Text> : source.placements.map((placement) => <Text key={placement.placementId}>• {placement.documentPath} → {placement.targetSchema} ({placement.cardinality})</Text>)}
				</Box>
			)}
			{stage === "blocks" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Schema parameter blocks</Text>
					<Text dimColor>Concepts and expressions target fields through blocks, not expression metadata.</Text>
					{source.blocks.length === 0 ? <Text color="yellow">No blocks configured</Text> : source.blocks.map((block) => <Text key={block.blockId}>• {block.label} → {block.target.targetSchema}.{block.target.targetPath} [{block.kind}]</Text>)}
				</Box>
			)}
			{stage === "macros" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Macro composition</Text>
					<Text dimColor>Each argument uses one placement unless fan-out is explicit.</Text>
					{source.macros.length === 0 ? <Text color="yellow">No macros configured</Text> : source.macros.map((macro) => <Text key={macro.macroId}>• {macro.macroName} ({macro.parameters.length} parameters, {macro.allowedPlacementIds.length} allowed placements)</Text>)}
				</Box>
			)}
			{stage === "review" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Review and publish</Text>
					<Text>Concepts: {source.concepts.length}  Expressions: {source.expressions.length}  Blocks: {source.blocks.length}  Macros: {source.macros.length}</Text>
					{result.diagnostics.length === 0 ? <Text color="green">Ready to save draft</Text> : result.diagnostics.map((diagnostic, index) => <Text key={`${diagnostic.code}-${index}`} color={diagnostic.severity === "error" ? "red" : "yellow"}>{diagnostic.severity === "error" ? "✗" : "!"} {diagnostic.message}</Text>)}
					<Text dimColor>Publishing remains immutable; save creates a new source version.</Text>
				</Box>
			)}
		</Box>
	);
}
