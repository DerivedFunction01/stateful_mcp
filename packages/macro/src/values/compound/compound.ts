import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { QuantityConversionRegistry } from "../conversion/conversion-registry";
import { EMPTY_DIAGNOSTICS, parseNumericValue } from "../numeric";
import { resolveUnitAlias as resolveQuantityUnit } from "../quantity";
import type { RecipeEvaluation, RecipeOutputBuilder } from "../recipes";
import { escapeRegex } from "../regex";

export interface QuantitySegment {
	readonly value: number;
	readonly unit: string;
	readonly canonicalValue: number;
}

export type MultiUnitCanonicalTarget = "base" | "primary" | "discrete" | string;

export interface ChainedQuantityResult {
	readonly kind: "quantity";
	readonly magnitude: number;
	readonly unit: string;
	readonly dimension: string;
	readonly chain: readonly QuantitySegment[];
	readonly rawText: string;
}

export interface ChainedQuantityDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface ChainedQuantityResolution {
	readonly value?: ChainedQuantityResult;
	readonly diagnostics: readonly ChainedQuantityDiagnostic[];
}

function evaluationValue(
	evaluation: RecipeEvaluation,
	slotId: string,
): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	return evaluation.slots[slotId]?.kind === "terminal"
		? evaluation.slots[slotId].value
		: undefined;
}

/** Builds a chained quantity from already-parsed authored amount/unit slots. */
export function createCompoundQuantityOutputBuilder(): RecipeOutputBuilder {
	return ({ evaluation, input, grammar, policy }) => {
		if (!grammar || evaluation.kind !== "fundamental") return { valid: false };
		const amountSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("NUM_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const unitSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("UNIT_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const packagingSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("PKG_CLASSIFIER_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const segments: QuantitySegment[] = [];
		for (const [segmentIndex, amountSlot] of amountSlots.entries()) {
			const amount = evaluationValue(evaluation, amountSlot);
			const unit = evaluationValue(evaluation, unitSlots[segmentIndex] ?? "");
			const packaging = evaluationValue(
				evaluation,
				packagingSlots[segmentIndex] ?? "",
			);
			const resolvedUnit =
				typeof unit === "string"
					? unit
					: typeof packaging === "string"
						? packaging
						: undefined;
			if (typeof amount !== "number" || !resolvedUnit) return { valid: false };
			const canonical =
				grammar.quantity.conversionRegistry?.convertToCanonicalByUnit(
					resolvedUnit,
					amount,
				);
			segments.push({
				value: amount,
				unit: resolvedUnit,
				canonicalValue: canonical?.canonicalAmount ?? amount,
			});
		}
		if (segments.length < 2) return { valid: false };
		const first = segments[0]!;
		const target =
			policy?.quantityConsumerPolicy?.allowedUnits?.[0] ?? first.unit;
		const canonicalTotal = segments.reduce(
			(total, segment) => total + segment.canonicalValue,
			0,
		);
		const converted =
			grammar.quantity.conversionRegistry?.convertFromCanonicalByUnit(
				target,
				canonicalTotal,
			);
		const value: ChainedQuantityResult = {
			kind: "quantity",
			magnitude: converted ?? canonicalTotal,
			unit: target,
			dimension:
				grammar.quantity.conversionRegistry?.getUnit(first.unit)?.dimension ??
				"unknown",
			chain: segments,
			rawText: input.trim(),
		};
		return { valid: true, value, displayValue: input.trim() };
	};
}

import type { BaseValueGrammarConfig } from "../numeric";
import type { DurationToken, ValueFormatConfig } from "../token-spec";

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

/**
 * Decomposes a single canonical scalar amount into an ordered multi-unit chain via greedy modulus reduction.
 * Target units are automatically sorted by descending magnitude in the conversion graph.
 */
export function decomposeScalarToChain(
	amount: number,
	sourceUnit: string,
	targetUnitIds: readonly string[],
	registry: QuantityConversionRegistry,
): QuantitySegment[] {
	if (!Number.isFinite(amount) || targetUnitIds.length === 0) return [];

	const sourceConversion = registry.convertToCanonicalByUnit(
		sourceUnit,
		amount,
	);
	if (!sourceConversion) return [];

	const baseAmount = sourceConversion.canonicalAmount;
	const dimension = sourceConversion.dimension;

	// Resolve the base canonical value for 1.0 unit of each target unit to determine factor
	const targetUnitsWithFactors: Array<{ unitId: string; factor: number }> = [];
	for (const unitId of targetUnitIds) {
		const targetDef = registry.getUnit(unitId);
		if (!targetDef || targetDef.dimension !== dimension) continue;
		const oneUnitCanonical = registry.convertToCanonical(
			dimension,
			unitId,
			1.0,
		);
		if (oneUnitCanonical !== undefined && oneUnitCanonical > 0) {
			targetUnitsWithFactors.push({ unitId, factor: oneUnitCanonical });
		}
	}

	if (targetUnitsWithFactors.length === 0) return [];

	// Automatically sort descending by factor (largest unit first)
	targetUnitsWithFactors.sort((left, right) => right.factor - left.factor);

	let remaining = baseAmount;
	const chain: QuantitySegment[] = [];

	for (let i = 0; i < targetUnitsWithFactors.length; i++) {
		const { unitId, factor } = targetUnitsWithFactors[i]!;
		const isTerminal = i === targetUnitsWithFactors.length - 1;

		if (isTerminal) {
			const count = Math.round((remaining / factor) * 1e6) / 1e6;
			if (count > 0 || chain.length === 0) {
				chain.push({
					unit: unitId,
					value: count,
					canonicalValue: count * factor,
				});
			}
		} else {
			const count = Math.floor((remaining + 1e-9) / factor);
			if (count > 0) {
				chain.push({
					unit: unitId,
					value: count,
					canonicalValue: count * factor,
				});
				remaining -= count * factor;
			}
		}
	}

	return chain;
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
