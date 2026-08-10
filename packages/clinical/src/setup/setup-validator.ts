import type { SchemaRegistry } from "../schemas/schema-registry";
import {
	findAmbiguousDateExamples,
	previewDateTimeFormat,
} from "./date-format-authoring";
import type { SetupSourceDocument, SetupValidationResult } from "./setup-types";

export function validateSetupSource(
	source: SetupSourceDocument,
	registry?: SchemaRegistry,
): SetupValidationResult {
	const diagnostics = [] as SetupValidationResult["diagnostics"];
	const placementIds = new Set<string>();
	const blockIds = new Set<string>();
	const expressionIds = new Set<string>();
	const conceptIds = new Set(
		source.concepts.map((concept) => concept.conceptId),
	);
	if (!source.primitiveProfile.dateTimeFormats?.length)
		diagnostics.push({
			severity: "warning",
			code: "unset_date_format",
			message: "No confirmed date/time format has been configured",
			path: "primitiveProfile.dateTimeFormats",
		});
	if (!source.primitiveProfile.decimalSeparator)
		diagnostics.push({
			severity: "warning",
			code: "unset_decimal_separator",
			message: "Decimal separator is not configured",
			path: "primitiveProfile.decimalSeparator",
		});
	if (!source.primitiveProfile.measurementUnitOrder)
		diagnostics.push({
			severity: "warning",
			code: "unset_measurement_unit_order",
			message: "Measurement unit order is not configured",
			path: "primitiveProfile.measurementUnitOrder",
		});
	for (const format of source.primitiveProfile.dateTimeFormats ?? []) {
		const examples =
			source.primitiveProfile.dateFormatExamples?.[format.id ?? ""] ??
			((source.primitiveProfile.dateTimeFormats ?? []).length === 1
				? source.primitiveProfile.dateExamples
				: []);
		for (const diagnostic of previewDateTimeFormat(format, examples)
			.diagnostics)
			diagnostics.push({
				severity: "error",
				code: `date_format_${diagnostic.code}`,
				message: diagnostic.message,
				path: `primitiveProfile.dateTimeFormats.${format.id ?? "unnamed"}`,
			});
		for (const example of examples) {
			const matches = findAmbiguousDateExamples(
				source.primitiveProfile.dateTimeFormats ?? [],
				example,
			);
			if (matches.length > 1)
				diagnostics.push({
					severity: "error",
					code: "ambiguous_date_format",
					message: `Example '${example}' matches multiple date formats: ${matches.join(", ")}`,
					path: "primitiveProfile.dateTimeFormats",
				});
		}
	}

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
		if (
			registry &&
			!registry.get(placement.targetSchema, placement.targetSchemaVersion)
		)
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
		if (
			block.source.kind === "concept" &&
			!conceptIds.has(block.source.conceptId)
		)
			diagnostics.push({
				severity: "error",
				code: "missing_block_concept",
				message: `Block '${block.blockId}' references missing concept '${block.source.conceptId}'`,
				path: `blocks.${block.blockId}`,
			});
	}

	for (const macro of source.macros) {
		if (macro.dateChild?.mode === "custom" && !macro.dateChild.childMacroId)
			diagnostics.push({
				severity: "error",
				code: "missing_date_child_macro",
				message: `Macro '${macro.macroId}' selects a custom date child without a child macro ID`,
				path: `macros.${macro.macroId}.dateChild`,
			});
		for (const template of macro.templates ?? []) {
			const slotIds = new Set<string>();
			for (const part of template.parts) {
				if (part.kind !== "slot") continue;
				if (slotIds.has(part.slotId))
					diagnostics.push({
						severity: "error",
						code: "duplicate_template_slot",
						message: `Template '${template.templateId}' contains duplicate slot '${part.slotId}'`,
						path: `macros.${macro.macroId}.templates.${template.templateId}`,
					});
				slotIds.add(part.slotId);
			}
			for (const gap of template.gaps) {
				if (gap.min !== undefined && gap.max !== undefined && gap.min > gap.max)
					diagnostics.push({
						severity: "error",
						code: "invalid_gap",
						message: `Gap '${gap.gapId}' has a minimum greater than its maximum`,
						path: `macros.${macro.macroId}.templates.${template.templateId}`,
					});
			}
		}
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
			if (
				parameter.placementMode === "fan_out" &&
				macro.allowedPlacementIds.length < 2
			)
				diagnostics.push({
					severity: "error",
					code: "invalid_fan_out",
					message: `Macro '${macro.macroId}' enables fan-out without at least two allowed placements`,
					path: `macros.${macro.macroId}`,
				});
		}
	}

	return {
		valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
		diagnostics,
	};
}
