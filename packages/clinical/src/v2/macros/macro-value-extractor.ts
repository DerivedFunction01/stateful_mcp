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
import type { TypedValue } from "../values/typed-value";
import type { MacroListItemInput } from "./macro-binding";
import {
	createMeasurementValue,
	type MeasurementValueInput,
} from "../values/measurement-value";

export type ValueExtractDiagnosticCode =
	| "invalid_scalar"
	| "invalid_enum"
	| "concept_required"
	| "invalid_measurement"
	| "invalid_temporal"
	| "blank_rejected";

export interface ValueExtractDiagnostic {
	code: ValueExtractDiagnosticCode;
	argumentId?: string;
	message: string;
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
					value: { kind: "concept", concept: { conceptId: resolved.concept.conceptId, display: resolved.concept.display }, rawText: conceptText },
					diagnostics: [],
				};
			}
			return {
				value: { kind: "concept", concept: { display: conceptText }, rawText: conceptText },
				diagnostics: [],
			};
		}
		case "concept_array": {
			const items = options.items?.length
				? options.items.map((item) => item.rawValue)
				: [options.captures?.concept ?? options.captures?.item ?? text];
			return {
				value: {
					kind: "concept_array",
					concepts: items.map((item) => ({ display: item })),
					mergeStrategy: "append",
					rawText: text,
				},
				diagnostics: [],
			};
		}
		case "enum": {
			const enumText = options.captures?.value ?? options.captures?.enum ?? text;
			const allowed = options.field?.enumValues;
			if (allowed && allowed.length > 0 && !allowed.includes(enumText)) {
				return {
					diagnostics: [{ code: "invalid_enum", argumentId: spec.argumentId, message: `'${text}' is not a valid ${spec.name}` }],
				};
			}
			return { value: { kind: "enum", value: enumText, rawText: text }, diagnostics: [] };
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
				value: { kind: "temporal", temporalType, value: options.captures?.value ?? text, rawText: text },
				diagnostics: [],
			};
		}
		case "array":
			return { value: { kind: "array", itemKind: "scalar", items: [], mergeStrategy: "append" }, diagnostics: [] };
		case "prose":
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text }, diagnostics: [] };
		default:
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text }, diagnostics: [] };
	}
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
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not an integer` }] };
			}
			return { value: { kind: "scalar", scalarType: "integer", value, rawText: text }, diagnostics: [] };
		}
		case "number": {
			const value = Number(text);
			if (!Number.isFinite(value)) {
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not a number` }] };
			}
			return { value: { kind: "scalar", scalarType: "number", value, rawText: text }, diagnostics: [] };
		}
		case "boolean": {
			if (text !== "true" && text !== "false") {
				return { diagnostics: [{ code: "invalid_scalar", argumentId: spec.argumentId, message: `'${text}' is not a boolean` }] };
			}
			return { value: { kind: "scalar", scalarType: "boolean", value: text === "true", rawText: text }, diagnostics: [] };
		}
		default:
			return { value: { kind: "scalar", scalarType: "string", value: text, rawText: text }, diagnostics: [] };
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
		return { diagnostics: [{ code: "invalid_measurement", argumentId: spec.argumentId, message: `'${text}' is not a measurement` }] };
	}
	const input: MeasurementValueInput = {
		dimension: field?.measurement?.dimension ?? spec.extraction.valueKind ?? "measurement",
		magnitude: Number(magnitude),
		unit: unit ?? "",
		operator: operator ? mapOperator(operator) : undefined,
		isApproximate: Boolean(approximate),
		rawText: text,
	};
	const result = createMeasurementValue(input, field?.measurement?.allowedUnits);
	if (!result.value) {
		return { diagnostics: result.diagnostics.map((d) => ({ code: "invalid_measurement" as const, argumentId: spec.argumentId, message: d.message })) };
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
