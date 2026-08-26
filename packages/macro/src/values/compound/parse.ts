import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { QuantityConversionRegistry } from "../conversion/conversion-registry";
import type { BaseValueGrammarConfig } from "../numeric";
import { EMPTY_DIAGNOSTICS, parseNumericValue } from "../numeric";
import { resolveUnitAlias as resolveQuantityUnit } from "../quantity";
import { escapeRegex } from "../regex";
import type { DurationToken, ValueFormatConfig } from "../token-spec";
import type {
	ChainedQuantityResult,
	MultiUnitCanonicalTarget,
	QuantitySegment,
} from "./compile";

export interface ChainedQuantityDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface ChainedQuantityResolution {
	readonly value?: ChainedQuantityResult;
	readonly diagnostics: readonly ChainedQuantityDiagnostic[];
}

export interface MultiUnitParserOptions extends BaseValueGrammarConfig {
	/** Format templates for duration or compound unit chains */
	readonly templates?: readonly (ValueFormatConfig<DurationToken> | string)[];
	/** Unit alias map to map raw tokens e.g. "years" -> "a", "feet" -> "[ft_i]" */
	readonly unitAliases?: Readonly<Record<string, readonly string[]>>;
	/** Target canonical unit selection */
	readonly targetCanonical?: MultiUnitCanonicalTarget;
	/** Allowed dimensions */
	readonly allowedDimensions?: readonly string[];
	/** Chain connector delimiters (e.g. ["and", "et", "und", "与", ","]) */
	readonly chainDelimiters?: readonly string[];
	/** Decimal separator */
	readonly decimalSeparator?: "." | ",";
}

/**
 * Parses an N-ary multi-unit chained measurement (e.g. "5 ft 11 in", "5'11\"", "2 years 3 months 5 days 2 minutes 3 seconds").
 */
export function parseMultiUnitChain(
	input: string,
	registry: QuantityConversionRegistry,
	options: MultiUnitParserOptions = {},
): ChainedQuantityResolution {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [
				{
					code: "EMPTY_INPUT",
					messageKey: "errors.compoundEmpty",
				},
			],
		};
	}

	// 1. Scan segments: handles numbers + units separated by connectors, whitespace, or shorthand punctuation
	const segments = extractRawSegments(rawText, options);
	if (segments.length === 0) {
		return {
			diagnostics: [
				{
					code: "NO_SEGMENTS_FOUND",
					messageKey: "errors.compoundNoSegments",
					messageParams: { rawText },
				},
			],
		};
	}

	let chainDimension: string | undefined;
	let baseCanonicalUnit: string | undefined;
	let totalCanonicalScalar = 0;
	const resolvedChain: QuantitySegment[] = [];

	for (const { rawValue, rawUnit } of segments) {
		const resolvedUnitId = resolveUnitAlias(
			rawUnit,
			options.unitAliases,
			registry,
		);
		if (!resolvedUnitId) {
			return {
				diagnostics: [
					{
						code: "UNKNOWN_UNIT",
						messageKey: "errors.compoundUnknownUnit",
						messageParams: {
							unit: rawUnit,
							segment: `${rawValue} ${rawUnit}`,
						},
					},
				],
			};
		}

		const unitDef = registry.getUnit(resolvedUnitId);
		if (!unitDef) {
			return {
				diagnostics: [
					{
						code: "UNREGISTERED_UNIT",
						messageKey: "errors.compoundUnregisteredUnit",
						messageParams: { unit: resolvedUnitId },
					},
				],
			};
		}

		if (chainDimension && chainDimension !== unitDef.dimension) {
			return {
				diagnostics: [
					{
						code: "DIMENSION_MISMATCH",
						messageKey: "errors.compoundDimensionMismatch",
						messageParams: {
							expected: chainDimension,
							received: unitDef.dimension,
							unit: rawUnit,
						},
					},
				],
			};
		}

		chainDimension = unitDef.dimension;
		const canonicalInfo = registry.convertToCanonicalByUnit(
			resolvedUnitId,
			rawValue,
		);
		if (!canonicalInfo) {
			return {
				diagnostics: [
					{
						code: "CONVERSION_FAILED",
						messageKey: "errors.compoundConversionFailed",
						messageParams: { unit: resolvedUnitId },
					},
				],
			};
		}

		baseCanonicalUnit = canonicalInfo.canonicalUnit;
		totalCanonicalScalar += canonicalInfo.canonicalAmount;
		resolvedChain.push({
			value: rawValue,
			unit: resolvedUnitId,
			canonicalValue: canonicalInfo.canonicalAmount,
		});
	}

	if (!chainDimension || !baseCanonicalUnit) {
		return {
			diagnostics: [
				{
					code: "EMPTY_CHAIN",
					messageKey: "errors.compoundEmptyChain",
				},
			],
		};
	}

	if (
		options.allowedDimensions &&
		!options.allowedDimensions.includes(chainDimension)
	) {
		return {
			diagnostics: [
				{
					code: "DIMENSION_NOT_ALLOWED",
					messageKey: "errors.compoundDimensionNotAllowed",
					messageParams: { dimension: chainDimension },
				},
			],
		};
	}

	// 2. Resolve Target Canonical Unit and Magnitude
	let finalUnit = baseCanonicalUnit;
	let finalMagnitude = totalCanonicalScalar;

	const targetChoice = options.targetCanonical ?? "base";
	if (targetChoice === "primary") {
		finalUnit = resolvedChain[0]!.unit;
		const converted = registry.convertFromCanonicalByUnit(
			finalUnit,
			totalCanonicalScalar,
		);
		if (converted !== undefined) finalMagnitude = converted;
	} else if (targetChoice === "discrete") {
		finalUnit = resolvedChain[resolvedChain.length - 1]!.unit;
		const converted = registry.convertFromCanonicalByUnit(
			finalUnit,
			totalCanonicalScalar,
		);
		if (converted !== undefined) finalMagnitude = converted;
	} else if (targetChoice !== "base") {
		// Custom target unit ID e.g. "days", "cm", "USD"
		const resolvedTarget =
			resolveUnitAlias(targetChoice, options.unitAliases, registry) ??
			targetChoice;
		const converted = registry.convertFromCanonicalByUnit(
			resolvedTarget,
			totalCanonicalScalar,
		);
		if (converted !== undefined) {
			finalUnit = resolvedTarget;
			finalMagnitude = converted;
		}
	}

	return {
		value: {
			kind: "quantity",
			magnitude: Math.round(finalMagnitude * 1e8) / 1e8,
			unit: finalUnit,
			dimension: chainDimension,
			chain: resolvedChain,
			rawText,
		},
		diagnostics: EMPTY_DIAGNOSTICS,
	};
}

function extractRawSegments(
	text: string,
	options: MultiUnitParserOptions = {},
): Array<{ rawValue: number; rawUnit: string }> {
	const segments: Array<{ rawValue: number; rawUnit: string }> = [];
	const dec = options.decimalSeparator === "," ? "," : "\\.";
	const connectors = (options.chainDelimiters ?? []).map(escapeRegex);
	const connectorPrefix = connectors.length
		? `(?:^|\\s+|(?:${connectors.join("|")})\\s*)`
		: `(?:^|\\s*)`;

	// Unicode property escape regex matching number + unit tuples across Latin, Cyrillic, CJK, and shorthand punctuation
	const segmentRegex = new RegExp(
		`${connectorPrefix}([+-]?[\\d\\p{Nd}]+(?:${dec}[\\d\\p{Nd}]+)?)\\s*('(?:\\s*)|"(?:\\s*)|#|°|\\[[a-zA-Z0-9_]+\\]|[\\p{L}\\p{Sc}_]+(?:\\d+)?)`,
		"gu",
	);
	const matches = Array.from(text.matchAll(segmentRegex));

	for (const match of matches) {
		const rawNumStr = match[1]!;
		const numRes = parseNumericValue(rawNumStr, {
			...options.numericConfig,
			decimalSeparator:
				options.decimalSeparator ?? options.numericConfig?.decimalSeparator,
		});
		const rawUnit = match[2]!.trim();
		if (numRes.parsed && rawUnit) {
			segments.push({ rawValue: numRes.parsed.value, rawUnit });
		}
	}

	return segments;
}

function resolveUnitAlias(
	rawUnit: string,
	unitAliases?: Readonly<Record<string, readonly string[]>>,
	registry?: QuantityConversionRegistry,
): string | undefined {
	const lower = rawUnit.toLocaleLowerCase();

	// Direct match in registry
	if (registry?.getUnit(rawUnit)) return rawUnit;
	if (registry?.getUnit(lower)) return lower;

	// Check configured unit aliases via centralized resolver
	const resolved = resolveQuantityUnit(rawUnit, unitAliases);
	return resolved?.canonicalUnit;
}
