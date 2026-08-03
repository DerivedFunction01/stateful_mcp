/**
 * V2 value extractor.
 *
 * Converts a raw bound argument value into a `TypedValue` using the argument's
 * extraction spec and (when available) the target schema field metadata. This
 * is the profile/rule-driven normalization layer; it never falls back to
 * hardcoded language-specific parsing and never imports the retired parser.
 */

import type { MacroArgumentSpec, V2ValueSpec } from "./macro-definition";
import type { SchemaField } from "../schemas/schema-types";
import type { TypedValue, ValueEvidence } from "../values/typed-value";
import type { MacroListItemInput } from "./macro-binding";
import {
	createMeasurementValue,
	type MeasurementValueInput,
} from "../values/measurement-value";
import { validateMeasurementConstraints, type MeasurementConstraint } from "../values/measurement-resolver";

export type ValueExtractDiagnosticCode =
	| "invalid_scalar"
	| "invalid_enum"
	| "concept_required"
	| "invalid_measurement"
	| "invalid_temporal"
	| "blank_rejected"
	| "array_item_invalid"
	| "array_empty"
	| "constraint_failed"
	| "dimension_mismatch"
	| "unit_not_allowed"
	| "unit_denied"
	| "raw_bounds_exceeded"
	| "normalized_bounds_exceeded";

export interface ValueExtractDiagnostic {
	code: ValueExtractDiagnosticCode;
	argumentId?: string;
	itemIndex?: number;
	message: string;
	path?: string;
	actual?: number;
	maximum?: number;
	minimum?: number;
}

export interface ValueExtractResult {
	value?: TypedValue;
	diagnostics: ValueExtractDiagnostic[];
}

export interface ExtractTypedValueOptions {
	field?: SchemaField;
	captures?: Record<string, string | undefined>;
	items?: readonly MacroListItemInput[];
	resolveConcept?: (raw: string) => Promise<{ concept?: { conceptId?: string; display: string }; diagnostics?: string[] }>;
}

export async function extractTypedValue(
	rawValue: string,
	spec: MacroArgumentSpec,
	options: ExtractTypedValueOptions = {},
): Promise<ValueExtractResult> {
	const text = rawValue.trim();
	if (text.length === 0) {
		if (spec.blankPolicy === "reject") {
			return {
				diagnostics: [{ code: "blank_rejected", argumentId: spec.argumentId, message: `Argument '${spec.name}' cannot be blank` }],
			};
		}
		return { diagnostics: [] };
	}

	switch (spec.extraction.kind) {
		case "concept": {
			const conceptText = options.captures?.concept ?? text;
			if (options.resolveConcept) {
				const resolved = await options.resolveConcept(conceptText);
				if (!resolved.concept) {
					return {
						diagnostics: [{ code: "concept_required", argumentId: spec.argumentId, message: resolved.diagnostics?.join("; ") ?? `Concept '${text}' could not be resolved` }],
					};
				}
				return {
					value: { kind: "concept", concept: { conceptId: resolved.concept.conceptId, display: resolved.concept.display }, rawText: conceptText, evidence: [{ source: "dictionary" }] },
					diagnostics: [],
				};
			}
			return {
				value: { kind: "concept", concept: { display: conceptText }, rawText: conceptText, evidence: [{ source: "pattern" }] },
				diagnostics: [],
			};
		}
		case "concept_array": {
			const items = options.items?.length
				? options.items.map((item) => item.rawValue)
				: [options.captures?.concept ?? options.captures?.item ?? text];
			const arrayDiagnostics: ValueExtractDiagnostic[] = [];
			const conceptItems = items.map((item, index) => {
				const trimmed = item.trim();
				if (trimmed.length === 0) {
					arrayDiagnostics.push({ code: "array_item_invalid", argumentId: spec.argumentId, itemIndex: index, message: `Array item at index ${index} is blank` });
					return { display: trimmed, evidence: [{ source: "array_item", index }] };
				}
				return { display: trimmed, evidence: [{ source: "array_item", index }] };
			});
			return {
				value: {
					kind: "concept_array",
					concepts: conceptItems,
					mergeStrategy: "append",
					rawText: text,
					evidence: [{ source: "concept_array" }],
				},
				diagnostics: arrayDiagnostics,
			};
		}
		case "enum": {
			const enumText = options.captures?.value ?? options.captures?.enum ?? text;
			const allowed = options.field?.enumValues;
			if (allowed && allowed.length > 0 && !allowed.includes(enumText)) {
				return {
					diagnostics: [{ code: "invalid_enum", argumentId: spec.argumentId, message: `'${text}' is not a valid ${spec.name}`, path: spec.target.targetPath }],
				};
			}
			return { value: { kind: "enum", value: enumText, rawText: text, evidence: [{ source: "enum_pattern" }] }, diagnostics: [] };
		}
		case "scalar": {
			return extractScalar(options.captures?.value ?? options.captures?.scalar ?? text, spec, options.field);
		}
		case "measurement": {
			return extractMeasurement(text, spec, options.field, options.captures);
		}
		case "temporal": {
			const temporalType = spec.extraction.temporalType;
			if (!temporalType) {
				return {
					diagnostics: [{ code: "invalid_temporal", argumentId: spec.argumentId, message: `Argument '${spec.name}' must declare temporalType` }],
				};
			}
			return {
				value: { kind: "temporal", temporalType, value: options.captures?.value ?? text, rawText: text, evidence: [{ source: "temporal_pattern" }] },
				diagnostics: [],
			};
		}
		case "array":
			return extractArray(text, spec, options);
		case "prose":
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text, evidence: [{ source: "prose" }] }, diagnostics: [] };
		default:
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text, evidence: [{ source: "default" }] }, diagnostics: [] };
	}
}

async function extractArray(
	text: string,
	spec: MacroArgumentSpec,
	options: ExtractTypedValueOptions,
): Promise<ValueExtractResult> {
	const delimiter = spec.extraction.itemDelimiter ?? ";";
	const rawItems = text.split(delimiter).map((item) => item.trim()).filter((item) => item.length > 0);
	if (rawItems.length === 0) {
		return { diagnostics: [{ code: "array_empty", argumentId: spec.argumentId, message: `Array argument '${spec.name}' has no items` }] };
	}
	const itemDiagnostics: ValueExtractDiagnostic[] = [];
	const items: TypedValue[] = [];
	for (const [index, rawItem] of rawItems.entries()) {
		const result = await extractTypedValue(rawItem, spec, options);
		for (const diag of result.diagnostics) {
			itemDiagnostics.push({ ...diag, itemIndex: index });
		}
		if (result.value) {
			items.push(result.value);
		}
	}
	return {
		value: {
			kind: "array",
			itemKind: "scalar",
			items,
			itemDelimiter: delimiter,
			mergeStrategy: "append",
			rawText: text,
			evidence: [{ source: "array_extraction" }],
		},
		diagnostics: itemDiagnostics,
	};
}

function extractScalar(
	text: string,
	spec: MacroArgumentSpec,
	field?: SchemaField,
): ValueExtractResult {
	const scalarType = field?.scalarType ?? "string";
	switch (scalarType) {
		case "integer": {
			const value = Number.parseInt(text, 10);
			if (!Number.isFinite(value) || String(value) !== text.replace(/^-/, "")) {
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not an integer`, path: spec.target.targetPath }] };
			}
			return { value: { kind: "scalar", scalarType: "integer", value, rawText: text, evidence: [{ source: "scalar_pattern" }] }, diagnostics: [] };
		}
		case "number": {
			const value = Number(text);
			if (!Number.isFinite(value)) {
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not a number`, path: spec.target.targetPath }] };
			}
			return { value: { kind: "scalar", scalarType: "number", value, rawText: text, evidence: [{ source: "scalar_pattern" }] }, diagnostics: [] };
		}
		case "boolean": {
			if (text !== "true" && text !== "false") {
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not a boolean`, path: spec.target.targetPath }] };
			}
			return { value: { kind: "scalar", scalarType: "boolean", value: text === "true", rawText: text, evidence: [{ source: "scalar_pattern" }] }, diagnostics: [] };
		}
		default:
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text, evidence: [{ source: "scalar_pattern" }] }, diagnostics: [] };
	}
}

function extractMeasurement(
	text: string,
	spec: MacroArgumentSpec,
	field?: SchemaField,
	captures?: Record<string, string | undefined>,
): ValueExtractResult {
	const groups = captures ?? {};
	const magnitude = groups.magnitude ?? groups.mag;
	const unit = groups.unit;
	const operator = groups.operator ?? groups.op;
	const approximate = groups.approximate ?? groups.approx;
	if (!magnitude) {
		return { diagnostics: [{ code: "invalid_measurement", argumentId: spec.argumentId, message: `'${text}' is not a measurement`, path: spec.target.targetPath }] };
	}
	const input: MeasurementValueInput = {
		dimension: field?.measurement?.dimension ?? spec.extraction.valueKind ?? "measurement",
		magnitude: Number(magnitude),
		unit: unit ?? "",
		operator: operator ? mapOperator(operator) : undefined,
		isApproximate: Boolean(approximate),
		rawText: text,
		rawBounds: spec.extraction.measurement?.rawBounds ?? spec.extraction.numericBounds,
		normalizedBounds: spec.extraction.measurement?.normalizedBounds,
		canonicalUnit: spec.extraction.measurement?.canonicalUnit,
		deniedUnits: spec.extraction.measurement?.deniedUnits,
	};
	const result = createMeasurementValue(input, field?.measurement?.allowedUnits);
	if (!result.value) {
		return { diagnostics: result.diagnostics.map((d) => ({
			code: d.code as ValueExtractDiagnosticCode,
			argumentId: spec.argumentId,
			path: spec.target.targetPath,
			message: d.message,
			actual: d.actual,
			maximum: d.maximum,
			minimum: d.minimum,
		})) };
	}
	return { value: result.value, diagnostics: [] };
}

function mapOperator(op: string): MeasurementValueInput["operator"] {
	switch (op) {
		case ">": return "gt";
		case ">=": return "gte";
		case "<": return "lt";
		case "<=": return "lte";
		default: return undefined;
	}
}
