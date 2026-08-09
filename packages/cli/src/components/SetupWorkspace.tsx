import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type {
	SetupDocumentPlacement,
	SetupMacroComposition,
	SetupSourceDocument,
	SetupValidationResult,
} from "@stateful-mcp/clinical";
import { validateSetupSource } from "@stateful-mcp/clinical";
import { DateTimeFormatWizard } from "./DateTimeFormatWizard";
import { PrimitiveSettingsEditor } from "./PrimitiveSettingsEditor";

type SetupStage = "fundamentals" | "document" | "blocks" | "macros" | "review";
const STAGES: SetupStage[] = ["fundamentals", "document", "blocks", "macros", "review"];

const FUNDAMENTAL_FIELDS = [
	"date format",
	"date example",
	"decimal separator",
	"thousands separator",
	"measurement example",
	"unit order",
	"temporal aliases",
	"unit aliases",
] as const;
const PLACEMENT_FIELDS = ["placement id", "document schema", "document path", "target schema", "cardinality"] as const;
const BLOCK_FIELDS = ["concept id", "concept display", "phrase", "target schema", "target path"] as const;
const MACRO_FIELDS = ["macro id", "macro name", "target schema", "date child"] as const;

type Field = (typeof FUNDAMENTAL_FIELDS)[number] | (typeof PLACEMENT_FIELDS)[number] | (typeof BLOCK_FIELDS)[number] | (typeof MACRO_FIELDS)[number];

const emptyPlacement = (): Record<string, string> => ({
	"placement id": "",
	"document schema": "ClinicalNote",
	"document path": "body.observations[]",
	"target schema": "Observation",
	cardinality: "many",
});
const emptyBlock = (): Record<string, string> => ({
	"concept id": "",
	"concept display": "",
	phrase: "",
	"target schema": "Observation",
	"target path": "concept",
});
const emptyMacro = (): Record<string, string> => ({
	"macro id": "",
	"macro name": "",
	"target schema": "Observation",
	"date child": "none",
});

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
	const [fieldIndex, setFieldIndex] = useState(0);
	const [draft, setDraft] = useState("");
	const [placement, setPlacement] = useState(emptyPlacement);
	const [block, setBlock] = useState(emptyBlock);
	const [macro, setMacro] = useState(emptyMacro);
	const [wizardVersion, setWizardVersion] = useState(0);
	const [fundamentalsPane, setFundamentalsPane] = useState<"date" | "numeric" | "measurement">("date");
	const currentIndex = STAGES.indexOf(stage);
	const result = useMemo(() => validation ?? validateSetupSource(source), [source, validation]);
	const fields = stage === "fundamentals"
		? FUNDAMENTAL_FIELDS
		: stage === "document"
			? PLACEMENT_FIELDS
			: stage === "blocks"
				? BLOCK_FIELDS
				: MACRO_FIELDS;
	const currentField = fields[fieldIndex] as Field | undefined;

	const update = (changes: Partial<SetupSourceDocument>) =>
		onChange({ ...source, ...changes, updatedAt: new Date().toISOString() });

	const setFormValue = (value: string) => {
		if (stage === "document") setPlacement((form) => ({ ...form, [currentField!]: value }));
		if (stage === "blocks") setBlock((form) => ({ ...form, [currentField!]: value }));
		if (stage === "macros") setMacro((form) => ({ ...form, [currentField!]: value }));
		setDraft("");
	};

	const addPlacement = (data = placement) => {
		if (!data["placement id"] || !data["target schema"]) return;
		const next: SetupDocumentPlacement = {
			placementId: data["placement id"],
			documentSchema: data["document schema"] ?? "ClinicalNote",
			documentVersion: 1,
			documentPath: data["document path"] ?? "body",
			targetSchema: data["target schema"],
			targetSchemaVersion: 1,
			cardinality: data.cardinality === "one" ? "one" : "many",
		};
		update({ placements: [...source.placements.filter((item) => item.placementId !== next.placementId), next] });
		setPlacement(emptyPlacement());
	};

	const addBlock = (data = block) => {
		if (!data["concept id"] || !data.phrase || !data["target schema"] || !data["target path"]) return;
		const concept = { conceptId: data["concept id"], namespaceCode: "LOCAL", standardCode: data["concept id"], display: data["concept display"] || data.phrase };
		const expressionId = `expr-${data["concept id"]}`;
		const blockId = `block-${data["concept id"]}`;
		update({
			concepts: [...source.concepts.filter((item) => item.conceptId !== concept.conceptId), concept],
			expressions: [...source.expressions.filter((item) => item.id !== expressionId), { id: expressionId, term: data.phrase, lookupTerm: data.phrase, regexPattern: data.phrase, isCaseInsensitive: true, conceptId: concept.conceptId, priorityWeight: 1, active: true }],
			conceptFilters: [...source.conceptFilters.filter((item) => item.filterId !== `filter-${blockId}`), { filterId: `filter-${blockId}`, conceptId: concept.conceptId, roleName: `${data["target schema"]}.${data["target path"]}`, policy: "whitelist", active: true }],
			blocks: [...source.blocks.filter((item) => item.blockId !== blockId), { blockId, version: 1, label: data["concept display"] || data.phrase, kind: "concept", target: { targetSchema: data["target schema"], targetPath: data["target path"] }, valueKind: "concept", source: { kind: "concept", conceptId: concept.conceptId }, filterIds: [`filter-${blockId}`], schemaVersion: 1, status: "draft" }],
		});
		setBlock(emptyBlock());
	};

	const addMacro = (data = macro) => {
		if (!data["macro id"] || !data["target schema"]) return;
		const dateMode = data["date child"] === "shared" ? "shared" : data["date child"] === "custom" ? "custom" : "none";
		const next: SetupMacroComposition = { macroId: data["macro id"], version: 1, macroName: data["macro name"] || data["macro id"], targetSchema: data["target schema"], targetSchemaVersion: 1, allowedPlacementIds: source.placements.filter((item) => item.targetSchema === data["target schema"]).map((item) => item.placementId), parameters: source.blocks.filter((item) => item.target.targetSchema === data["target schema"]).map((item) => ({ argumentId: item.blockId, blockId: item.blockId })), dateChild: { mode: dateMode, ...(dateMode === "custom" ? { childMacroId: "simple-date", targetPath: "dateRange" } : dateMode === "shared" ? { targetPath: "dateRange" } : {}) }, status: "draft" };
		update({ macros: [...source.macros.filter((item) => item.macroId !== next.macroId), next] });
		setMacro(emptyMacro());
	};

	const advance = (direction: number) => {
		setStage(STAGES[Math.max(0, Math.min(STAGES.length - 1, currentIndex + direction))]!);
		setFieldIndex(0);
		setDraft("");
	};

	useInput((input, key) => {
		if (stage === "fundamentals") {
			if (key.escape) return onExit();
			if (key.leftArrow || key.rightArrow) return advance(key.leftArrow ? -1 : 1);
			return;
		}
		if (key.escape) return onExit();
		if (key.leftArrow) return advance(-1);
		if (key.rightArrow) return advance(1);
		if (key.tab) {
			setFieldIndex((value) => (value + 1) % fields.length);
			setDraft("");
			return;
		}
		if (key.backspace || key.delete) return setDraft((value) => value.slice(0, -1));
		if (key.return) {
			if (stage === "document") {
				const next = { ...placement, [currentField!]: draft.trim() };
				setFormValue(draft.trim());
				if (fieldIndex === fields.length - 1) addPlacement(next);
				else setFieldIndex((value) => value + 1);
				return;
			}
			if (stage === "blocks") {
				const next = { ...block, [currentField!]: draft.trim() };
				setFormValue(draft.trim());
				if (fieldIndex === fields.length - 1) addBlock(next);
				else setFieldIndex((value) => value + 1);
				return;
			}
			if (stage === "macros") {
				const next = { ...macro, [currentField!]: draft.trim() };
				setFormValue(draft.trim());
				if (fieldIndex === fields.length - 1) addMacro(next);
				else setFieldIndex((value) => value + 1);
				return;
			}
			if (stage === "review") return onSave();
		}
		if (input) setDraft((value) => value + input);
	});

	const form = stage === "document" ? placement : stage === "blocks" ? block : macro;
	return (
		<Box flexDirection="column" padding={1}>
			<Box justifyContent="space-between"><Text bold>Clinical setup</Text><Text dimColor>Esc exit  Tab field  ←/→ stage  Enter apply</Text></Box>
			<Box marginTop={1}>{STAGES.map((item, index) => <Text key={item} color={item === stage ? "cyan" : undefined}>{index < currentIndex ? "✓" : index === currentIndex ? "→" : "○"} {item} {index < STAGES.length - 1 ? "  " : ""}</Text>)}</Box>
			{stage === "fundamentals" && fundamentalsPane === "date" && <DateTimeFormatWizard
				key={wizardVersion}
				existingFormats={source.primitiveProfile.dateTimeFormats ?? []}
				onCancel={onExit}
				onOpenNumeric={() => setFundamentalsPane("numeric")}
				onOpenMeasurement={() => setFundamentalsPane("measurement")}
				onConfirm={(format, examples, preferred) => {
					const formats = [...(source.primitiveProfile.dateTimeFormats ?? []).filter((item) => item.id !== format.id), format];
					onChange({
						...source,
						primitiveProfile: {
							...source.primitiveProfile,
							dateTimeFormats: formats,
							dateFormatExamples: { ...(source.primitiveProfile.dateFormatExamples ?? {}), [format.id ?? "unnamed"]: examples },
							dateExamples: [...new Set([...source.primitiveProfile.dateExamples, ...examples])],
							...(preferred || !source.primitiveProfile.preferredDateFormat ? { preferredDateFormat: format.id } : {}),
						},
						updatedAt: new Date().toISOString(),
					});
					setWizardVersion((value) => value + 1);
				}}
			/>}
			{stage === "fundamentals" && fundamentalsPane !== "date" && <PrimitiveSettingsEditor
				mode={fundamentalsPane}
				profile={source.primitiveProfile}
				onCancel={onExit}
				onOpenDate={() => setFundamentalsPane("date")}
				onChange={(primitiveProfile) => onChange({ ...source, primitiveProfile, updatedAt: new Date().toISOString() })}
			/>}
			{stage === "document" && <EditorStage title="Document placements" fields={fields} fieldIndex={fieldIndex} draft={draft} form={form} hint="Add a reusable schema placement. Use one or many cardinality." items={source.placements.map((item) => `${item.placementId}: ${item.documentPath} → ${item.targetSchema} (${item.cardinality})`)} />}
			{stage === "blocks" && <EditorStage title="Concepts and grammar blocks" fields={fields} fieldIndex={fieldIndex} draft={draft} form={form} hint="One guided entry creates a concept, expression, and executable concept block." items={source.blocks.map((item) => `${item.label}: ${item.target.targetSchema}.${item.target.targetPath}`)} />}
			{stage === "macros" && <EditorStage title="Macro composer" fields={fields} fieldIndex={fieldIndex} draft={draft} form={form} hint="Macros include matching blocks for the selected target schema and an explicit date-child policy." items={source.macros.map((item) => `${item.macroName}: ${item.parameters.length} fields, ${item.allowedPlacementIds.length} placements, date=${item.dateChild?.mode ?? "none"}`)} />}
			{stage === "review" && <Box flexDirection="column" marginTop={1}><Text bold>Semantic review</Text><Text>Concepts {source.concepts.length}  Expressions {source.expressions.length}  Placements {source.placements.length}  Blocks {source.blocks.length}  Macros {source.macros.length}</Text>{result.diagnostics.length === 0 ? <Text color="green">Ready to save draft</Text> : result.diagnostics.map((item, index) => <Text key={`${item.code}-${index}`} color={item.severity === "error" ? "red" : "yellow"}>{item.severity === "error" ? "✗" : "!"} {item.message}</Text>)}<Text dimColor>Enter saves the source. Publish and activate it through the setup CLI lifecycle commands.</Text></Box>}
		</Box>
	);
}

function EditorStage({ title, fields, fieldIndex, draft, form, hint, items }: { title: string; fields: readonly string[]; fieldIndex: number; draft: string; form: Record<string, string>; hint: string; items: string[] }) {
	return <Box flexDirection="column" marginTop={1}><Text bold>{title}</Text><Text dimColor>{hint}</Text><Text color="cyan">{fields[fieldIndex]}: {draft || form[fields[fieldIndex]!] || "type a value"}</Text><Text dimColor>Tab moves between fields; Enter applies each value.</Text>{items.length === 0 ? <Text color="yellow">No entries configured</Text> : items.map((item) => <Text key={item}>• {item}</Text>)}</Box>;
}
