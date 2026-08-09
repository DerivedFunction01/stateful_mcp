import type {
	MacroArgumentSpec,
	MacroDefinition,
	MacroValueSpecKind,
	ValueSpec,
} from "../macros/macro-definition";
import type {
	SetupGrammarBlock,
	SetupMacroComposition,
	SetupDocumentPlacement,
} from "./setup-types";

export interface SetupPlacementOperation {
	argumentId: string;
	blockId: string;
	placementId: string;
	documentPath: string;
	mode: "single" | "fan_out";
}

export function compileSetupMacro(
	composition: SetupMacroComposition,
	blocks: readonly SetupGrammarBlock[],
): MacroDefinition {
	const blockById = new Map(blocks.map((block) => [block.blockId, block]));
	const argumentsList: MacroArgumentSpec[] = composition.parameters.flatMap(
		(parameter, position) => {
			const block = blockById.get(parameter.blockId);
			if (!block) return [];
			const extraction = createValueSpec(block);
			return [
				{
					argumentId: parameter.argumentId,
					name: block.label,
					roleName: `${block.target.targetSchema}.${block.target.targetPath}`,
					position,
					target: block.target,
					extraction,
					required: extraction.required,
					blankPolicy: extraction.required ? "reject" : "skip",
					autocomplete: {
						source: block.kind === "concept" || block.kind === "expression"
							? "dictionary"
							: "static",
					},
				},
			];
		},
	);

	return {
		macroId: composition.macroId,
		macroName: composition.macroName,
		version: composition.version,
		status: composition.status,
		active: composition.status === "published",
		root: {
			roleName: composition.targetSchema,
			targetSchema: composition.targetSchema,
			outputCellKind: "structured",
		},
		arguments: argumentsList,
		execution: { atomic: true },
		description: `Generated from setup composition ${composition.macroId}`,
	};
}

export function expandSetupPlacements(
	composition: SetupMacroComposition,
	placements: readonly SetupDocumentPlacement[],
): SetupPlacementOperation[] {
	const byId = new Map(placements.map((placement) => [placement.placementId, placement]));
	return composition.parameters.flatMap((parameter) => {
		const mode = parameter.placementMode ?? "single";
		const ids = mode === "fan_out"
			? composition.allowedPlacementIds
			: [parameter.placementId ?? composition.defaultPlacementId].filter(
					(value): value is string => Boolean(value),
				);
		return ids.flatMap((placementId) => {
			const placement = byId.get(placementId);
			if (!placement) return [];
			return [{
				argumentId: parameter.argumentId,
				blockId: parameter.blockId,
				placementId,
				documentPath: placement.documentPath,
				mode,
			}];
		});
	});
}

function createValueSpec(block: SetupGrammarBlock): ValueSpec {
	const kind = toMacroKind(block.kind);
	const patterns = block.source.kind === "generated"
		? block.source.recipe.phrases
		: undefined;
	return {
		kind,
		valueKind: block.valueKind as ValueSpec["valueKind"],
		patterns,
		target: block.target,
		required: block.kind === "concept" || block.kind === "expression",
		blankPolicy: block.kind === "concept" || block.kind === "expression" ? "reject" : "skip",
	};
}

function toMacroKind(kind: SetupGrammarBlock["kind"]): MacroValueSpecKind {
	switch (kind) {
		case "concept":
		case "expression":
			return "concept";
		case "enum":
			return "enum";
		case "measurement":
			return "measurement";
		case "temporal":
			return "temporal";
		case "numeric":
		case "comparison":
			return "scalar";
		case "target-alias":
			return "prose";
	}
}
