import type { QuantityDimension, UnitId } from "./conversion/contracts";
import type { QuantityConversionRegistry } from "./conversion/conversion-registry";
import { type NumericParseOptions, parseNumericValue } from "./numeric";
import {
	type ExtractedOperatorResult,
	extractOperator,
	type OperatorConfig,
	type OperatorMatch,
} from "./operators";
import {
	type ExtractedQualifierResult,
	extractStatisticalQualifier,
	type StatisticalConfig,
	type StatisticalConsumerPolicy,
	type StatisticalQualifier,
} from "./statistics";
import {
	extractPostfixAlias,
	flattenAndSortAliases,
	splitByDelimiters,
} from "./token-matcher";

export interface SingleQuantity {
	readonly magnitude: number;
	readonly unit: string;
	readonly canonicalUnit?: UnitId;
	readonly canonicalMagnitude?: number;
	readonly rawText: string;
}

export type RangeDirection = "ascending" | "descending" | "equal";

export interface QuantityRange {
	readonly start: SingleQuantity;
	readonly end: SingleQuantity;
	readonly direction: RangeDirection;
	readonly isHeterogeneousUnits?: boolean;
	readonly chainedSteps?: readonly SingleQuantity[];
	readonly rawText: string;
}

export interface QuantityGrammarResult {
	readonly primaryQuantity: SingleQuantity;
	readonly range?: QuantityRange;
	readonly operator?: OperatorMatch;
	readonly statisticalQualifier?: StatisticalQualifier;
	readonly rawText: string;
}

export interface QuantityGrammarConfig extends NumericParseOptions {
	/** Mapping of canonical UnitId to user/localized alias strings */
	readonly unitAliases?: Readonly<Record<string, readonly string[]>>;
	/** Range delimiters (e.g. ["-", "to", "until", "down to", "bis", "a", "至", "到"]) */
	readonly rangeDelimiters?: readonly string[];
	/** Operator extraction configuration */
	readonly operatorConfig?: OperatorConfig;
	/** Statistical qualifier configuration */
	readonly statisticalConfig?: StatisticalConfig;
	/** Conversion registry to validate dimensional compatibility and compute canonical magnitudes */
	readonly conversionRegistry?: QuantityConversionRegistry;
	/** Directional descending range delimiters (e.g. ["down to", "herunter auf", "descendiendo a"]) */
	readonly descendingDelimiters?: readonly string[];
	readonly locales?: string | readonly string[];
}

export interface QuantityConsumerPolicy {
	/** Allowed unit IDs (e.g. ["mg", "g", "kg"]) */
	readonly allowedUnits?: readonly string[];
	/** Allowed physical dimensions (e.g. ["mass", "volume"]) */
	readonly allowedDimensions?: readonly QuantityDimension[];
	/** Whether ranges (min-max or start-end) are allowed */
	readonly allowRange?: boolean;
	/** Whether descending / directional ranges (e.g. 20 mg down to 5 mg) are allowed */
	readonly allowDirectionalRange?: boolean;
	/** Whether chained steps (e.g. 10 to 20 to 40 mg) are allowed */
	readonly allowChainedSteps?: boolean;
	/** Whether heterogeneous units in a range (e.g. 50 mg to 1 g) are allowed */
	readonly allowHeterogeneousUnits?: boolean;
	/** Whether prefix/postfix operators (e.g. >= 50 mg) are allowed */
	readonly allowOperator?: boolean;
	/** Granular statistical qualifier policy (e.g. point_estimate_only) */
	readonly statisticsPolicy?: StatisticalConsumerPolicy;
}

export interface QuantityDiagnostic {
	readonly code: string;
	readonly message: string;
}

export interface QuantityGrammarResolution {
	readonly value?: QuantityGrammarResult;
	readonly diagnostics: readonly QuantityDiagnostic[];
}

/**
 * Resolves a unit token against user-configured unitAliases, returning the canonical UnitId if matched.
 */
export function resolveUnitAlias(
	unitToken: string,
	aliases?: Readonly<Record<string, readonly string[]>>,
	locales?: string | readonly string[],
): { canonicalUnit: string; matchedAlias: string } | undefined {
	const trimmed = unitToken.trim();
	if (!trimmed) return undefined;

	if (!aliases) {
		return { canonicalUnit: trimmed, matchedAlias: trimmed };
	}

	const lower = trimmed.toLocaleLowerCase(locales as string);
	const sorted = flattenAndSortAliases(aliases, true);
	for (const { key, alias } of sorted) {
		if (alias.toLocaleLowerCase(locales as string) === lower) {
			return { canonicalUnit: key, matchedAlias: alias };
		}
	}

	// Fallback to literal unit string
	return { canonicalUnit: trimmed, matchedAlias: trimmed };
}

/**
 * Parses free text into a single quantity, heterogeneous range, directional range, or chained steps.
 */
export function parseQuantity(
	input: string,
	config: QuantityGrammarConfig = {},
	policy: QuantityConsumerPolicy = {
		allowRange: true,
		allowOperator: true,
	},
): QuantityGrammarResolution {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [
				{ code: "invalid_quantity", message: "Quantity text is empty" },
			],
		};
	}

	let text = rawText;
	const diagnostics: QuantityDiagnostic[] = [];

	// 1. Extract Statistical Qualifier if configured
	let statisticalQualifier: StatisticalQualifier | undefined;
	if (config.statisticalConfig) {
		const statResult: ExtractedQualifierResult = extractStatisticalQualifier(
			text,
			config.statisticalConfig,
			policy.statisticsPolicy,
		);
		if (statResult.diagnostics.length > 0) {
			return { diagnostics: statResult.diagnostics };
		}
		if (statResult.qualifierMatch) {
			statisticalQualifier = statResult.qualifierMatch;
			text = statResult.remainderText;
		}
	}

	// 2. Extract Operator if configured
	let operatorMatch: OperatorMatch | undefined;
	if (config.operatorConfig) {
		const opResult: ExtractedOperatorResult = extractOperator(
			text,
			config.operatorConfig,
		);
		if (opResult.operatorMatch) {
			if (policy.allowOperator === false) {
				return {
					diagnostics: [
						{
							code: "operator_not_allowed",
							message: `Operator '${opResult.operatorMatch.rawText}' is not permitted for this quantity`,
						},
					],
				};
			}
			operatorMatch = opResult.operatorMatch;
			text = opResult.remainderText;
		}
	}

	// 3. Check for Range Delimiters
	const rangeDelimiters = config.rangeDelimiters ?? ["-"];
	const splitResult = splitQuantityRange(text, rangeDelimiters);

	if (splitResult && splitResult.parts.length > 1) {
		if (policy.allowRange === false) {
			return {
				diagnostics: [
					{
						code: "range_not_allowed",
						message: "Quantity ranges are not permitted for this field",
					},
				],
			};
		}

		if (splitResult.parts.length > 2 && policy.allowChainedSteps === false) {
			return {
				diagnostics: [
					{
						code: "chained_steps_not_allowed",
						message: "Chained quantity sequences are not permitted",
					},
				],
			};
		}

		// Parse each step in the range
		const parsedSteps: SingleQuantity[] = [];
		let trailingUnit: string | undefined;

		// Scan from right to left to inherit trailing unit (e.g. "10 to 20 mg" -> 10 inherits mg)
		for (let i = splitResult.parts.length - 1; i >= 0; i--) {
			const part = splitResult.parts[i]?.trim();
			if (!part) continue;

			const parsedSingle = parseSingleQuantityPart(part, config, trailingUnit);
			if (!parsedSingle) {
				return {
					diagnostics: [
						{
							code: "invalid_quantity",
							message: `Unable to parse quantity segment '${part}'`,
						},
					],
				};
			}
			trailingUnit = parsedSingle.unit;
			parsedSteps.unshift(parsedSingle);
		}

		if (parsedSteps.length < 2) {
			return {
				diagnostics: [
					{
						code: "invalid_range",
						message: `Invalid range format '${rawText}'`,
					},
				],
			};
		}

		const firstStep = parsedSteps[0];
		const lastStep = parsedSteps[parsedSteps.length - 1];
		if (!firstStep || !lastStep) {
			return {
				diagnostics: [
					{
						code: "invalid_range",
						message: `Invalid range format '${rawText}'`,
					},
				],
			};
		}

		const isHeterogeneous = firstStep.unit !== lastStep.unit;
		if (isHeterogeneous) {
			if (policy.allowHeterogeneousUnits === false) {
				return {
					diagnostics: [
						{
							code: "heterogeneous_units_not_allowed",
							message: `Heterogeneous units '${firstStep.unit}' and '${lastStep.unit}' are not permitted in range`,
						},
					],
				};
			}

			// Validate dimensional compatibility via conversionRegistry
			if (config.conversionRegistry) {
				const unit1 = config.conversionRegistry.getUnit(
					(firstStep.canonicalUnit ?? firstStep.unit) as UnitId,
				);
				const unit2 = config.conversionRegistry.getUnit(
					(lastStep.canonicalUnit ?? lastStep.unit) as UnitId,
				);
				if (unit1 && unit2 && unit1.dimension !== unit2.dimension) {
					return {
						diagnostics: [
							{
								code: "incompatible_range_dimensions",
								message: `Range endpoints have incompatible dimensions ('${unit1.dimension}' vs '${unit2.dimension}')`,
							},
						],
					};
				}
			}
		}

		// Calculate direction
		const startVal = firstStep.canonicalMagnitude ?? firstStep.magnitude;
		const endVal = lastStep.canonicalMagnitude ?? lastStep.magnitude;
		let direction: RangeDirection = "equal";
		if (startVal < endVal) direction = "ascending";
		else if (startVal > endVal) direction = "descending";

		if (direction === "descending" && policy.allowDirectionalRange === false) {
			return {
				diagnostics: [
					{
						code: "descending_range_not_allowed",
						message: `Range lower bound (${firstStep.magnitude}) must not exceed upper bound (${lastStep.magnitude})`,
					},
				],
			};
		}

		// Validate policy allowed units and dimensions
		for (const step of parsedSteps) {
			const unitCheck = validateUnitPolicy(step, config, policy);
			if (unitCheck.length > 0) {
				return { diagnostics: unitCheck };
			}
		}

		const rangeObj: QuantityRange = {
			start: firstStep,
			end: lastStep,
			direction,
			...(isHeterogeneous ? { isHeterogeneousUnits: true } : {}),
			...(parsedSteps.length > 2 ? { chainedSteps: parsedSteps } : {}),
			rawText,
		};

		return {
			value: {
				primaryQuantity: firstStep,
				range: rangeObj,
				...(operatorMatch ? { operator: operatorMatch } : {}),
				...(statisticalQualifier ? { statisticalQualifier } : {}),
				rawText,
			},
			diagnostics: [],
		};
	}

	// 4. Single Quantity Parsing
	const singleParsed = parseSingleQuantityPart(text, config);
	if (!singleParsed) {
		return {
			diagnostics: [
				{
					code: "invalid_quantity",
					message: `Unable to parse quantity '${rawText}'`,
				},
			],
		};
	}

	const unitCheck = validateUnitPolicy(singleParsed, config, policy);
	if (unitCheck.length > 0) {
		return { diagnostics: unitCheck };
	}

	return {
		value: {
			primaryQuantity: singleParsed,
			...(operatorMatch ? { operator: operatorMatch } : {}),
			...(statisticalQualifier ? { statisticalQualifier } : {}),
			rawText,
		},
		diagnostics: [],
	};
}

function splitQuantityRange(
	text: string,
	delimiters: readonly string[],
): { parts: string[]; delimiter: string } | undefined {
	return splitByDelimiters(text, delimiters, { requireBoundaries: true });
}

function parseSingleQuantityPart(
	partText: string,
	config: QuantityGrammarConfig,
	inheritedUnit?: string,
): SingleQuantity | undefined {
	const trimmed = partText.trim();
	if (!trimmed) return undefined;

	// Check if part ends with a known unit or has a trailing word
	let matchedUnit: string | undefined;
	let numericPart = trimmed;

	if (config.unitAliases) {
		const sorted = flattenAndSortAliases(config.unitAliases, true);
		const postMatch = extractPostfixAlias(trimmed, sorted, config.locales);
		if (postMatch) {
			numericPart = postMatch.remainderText;
			matchedUnit = postMatch.key;
		}
	}

	// If no unit matched, check split by trailing whitespace
	if (!matchedUnit) {
		const splitMatch = trimmed.match(
			/^(?<num>.+?)\s+(?<unit>[^\d\p{Nd}\s]+)$/u,
		);
		if (splitMatch?.groups?.num && splitMatch?.groups?.unit) {
			numericPart = splitMatch.groups.num.trim();
			const resolved = resolveUnitAlias(
				splitMatch.groups.unit,
				config.unitAliases,
				config.locales,
			);
			matchedUnit = resolved?.canonicalUnit ?? splitMatch.groups.unit;
		}
	}

	// If still no unit, inherit from right-side range context
	if (!matchedUnit && inheritedUnit) {
		matchedUnit = inheritedUnit;
	}

	if (!matchedUnit) {
		return undefined;
	}

	const numRes = parseNumericValue(numericPart, config);
	if (!numRes.parsed) {
		return undefined;
	}

	const magnitude = numRes.parsed.value;
	let canonicalMagnitude: number | undefined;
	let canonicalUnit: UnitId | undefined;

	// Calculate canonical magnitude if conversion registry is present
	if (config.conversionRegistry) {
		try {
			const conv = config.conversionRegistry.convertToCanonicalByUnit(
				matchedUnit as UnitId,
				magnitude,
			);
			if (conv) {
				canonicalMagnitude = conv.canonicalAmount;
				canonicalUnit = conv.canonicalUnit;
			}
		} catch {
			// Non-fatal if unit not registered in conversion table
		}
	}

	return {
		magnitude,
		unit: matchedUnit,
		...(canonicalMagnitude !== undefined && canonicalUnit
			? {
					canonicalUnit,
					canonicalMagnitude,
				}
			: {}),
		rawText: trimmed,
	};
}

function validateUnitPolicy(
	qty: SingleQuantity,
	config: QuantityGrammarConfig,
	policy: QuantityConsumerPolicy,
): QuantityDiagnostic[] {
	const diagnostics: QuantityDiagnostic[] = [];

	if (policy.allowedUnits && policy.allowedUnits.length > 0) {
		if (!policy.allowedUnits.includes(qty.unit)) {
			diagnostics.push({
				code: "unit_not_allowed",
				message: `Unit '${qty.unit}' is not in the permitted unit list`,
			});
		}
	}

	if (
		policy.allowedDimensions &&
		policy.allowedDimensions.length > 0 &&
		config.conversionRegistry
	) {
		const unitDef = config.conversionRegistry.getUnit(qty.unit as UnitId);
		if (unitDef && !policy.allowedDimensions.includes(unitDef.dimension)) {
			diagnostics.push({
				code: "dimension_not_allowed",
				message: `Physical dimension '${unitDef.dimension}' for unit '${qty.unit}' is not permitted`,
			});
		}
	}

	return diagnostics;
}
