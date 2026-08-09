import type { SchemaRegistry } from "../schemas/schema-registry";
import type { SetupSourceDocument, SetupValidationResult } from "./setup-types";

export function validateSetupSource(
	source: SetupSourceDocument,
	registry?: SchemaRegistry,
): SetupValidationResult {
	const diagnostics = [] as SetupValidationResult["diagnostics"];
	const placementIds = new Set<string>();
	const blockIds = new Set<string>();
	const expressionIds = new Set<string>();
	const conceptIds = new Set(source.concepts.map((concept) => concept.conceptId));

	for (const expression of source.expressions) {
		if (expressionIds.has(expression.id))
			diagnostics.push({
				severity: "error",
				code: "duplicate_expression",
				message: `Expression '${expression.id}' is defined more than once`,
				path: `expressions.${expression.id}`,
			});
		expressionIds.add(expression.id);
		if (expression.conceptId && !conceptIds.has(expression.conceptId))
			diagnostics.push({
				severity: "error",
				code: "missing_concept",
				message: `Expression '${expression.id}' references missing concept '${expression.conceptId}'`,
				path: `expressions.${expression.id}`,
			});
	}

	for (const placement of source.placements) {
		if (placementIds.has(placement.placementId))
			diagnostics.push({
				severity: "error",
				code: "duplicate_placement",
				message: `Placement '${placement.placementId}' is defined more than once`,
				path: `placements.${placement.placementId}`,
			});
		placementIds.add(placement.placementId);
		if (registry && !registry.get(placement.targetSchema, placement.targetSchemaVersion))
			diagnostics.push({
				severity: "error",
				code: "missing_schema",
				message: `Placement '${placement.placementId}' references missing schema '${placement.targetSchema}'`,
				path: `placements.${placement.placementId}`,
			});
	}

	for (const block of source.blocks) {
		if (blockIds.has(block.blockId))
			diagnostics.push({
				severity: "error",
				code: "duplicate_block",
				message: `Block '${block.blockId}' is defined more than once`,
				path: `blocks.${block.blockId}`,
			});
		blockIds.add(block.blockId);
		if (block.source.kind === "concept" && !conceptIds.has(block.source.conceptId))
			diagnostics.push({
				severity: "error",
				code: "missing_block_concept",
				message: `Block '${block.blockId}' references missing concept '${block.source.conceptId}'`,
				path: `blocks.${block.blockId}`,
			});
	}

	for (const macro of source.macros) {
		for (const placementId of macro.allowedPlacementIds) {
			if (!placementIds.has(placementId))
				diagnostics.push({
					severity: "error",
					code: "missing_macro_placement",
					message: `Macro '${macro.macroId}' references missing placement '${placementId}'`,
					path: `macros.${macro.macroId}`,
				});
		}
		for (const parameter of macro.parameters) {
			if (!blockIds.has(parameter.blockId))
				diagnostics.push({
					severity: "error",
					code: "missing_macro_block",
					message: `Macro '${macro.macroId}' references missing block '${parameter.blockId}'`,
					path: `macros.${macro.macroId}`,
				});
			if (parameter.placementMode === "fan_out" && macro.allowedPlacementIds.length < 2)
				diagnostics.push({
					severity: "error",
					code: "invalid_fan_out",
					message: `Macro '${macro.macroId}' enables fan-out without at least two allowed placements`,
					path: `macros.${macro.macroId}`,
				});
		}
	}

	return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), diagnostics };
}
