import type { UnitId } from "../conversion/contracts";
import { compileFundamentalGroups, extractFundamental } from "../fundamentals";
import { EMPTY_DIAGNOSTICS } from "../numeric";
import {
	type ExtractedOperatorResult,
	extractOperator,
	type OperatorMatch,
} from "../operators";
import type {
	ExtractedQualifierResult,
	StatisticalQualifier,
} from "../statistics";
import { extractStatisticalQualifier } from "../statistics";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
	QuantityGrammarResolution,
	QuantityGrammarResult,
	QuantityRange,
	RangeDirection,
	SingleQuantity,
} from "./contracts";
import {
	parseSingleQuantityPart,
	splitQuantityRange,
	validateUnitPolicy,
} from "./parse";

/**
 * Parses free text into a single quantity, heterogeneous range, directional range, or chained steps.
 */
export function evaluateQuantityGrammar(
	input: string,
	config: QuantityGrammarConfig = {},
	policy: QuantityConsumerPolicy = {},
): QuantityGrammarResolution {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [
				{
					code: "invalid_quantity",
					messageKey: "errors.quantityEmpty",
				},
			],
		};
	}

	let text = rawText;

	// 1. Extract Statistical Qualifier if configured
	let statisticalQualifier: StatisticalQualifier | undefined;
	if (config.statisticalConfig) {
		const statRes: ExtractedQualifierResult = extractStatisticalQualifier(
			text,
			config.statisticalConfig,
			policy.statisticsPolicy,
		);
		if (statRes.diagnostics.length > 0) {
			return { diagnostics: statRes.diagnostics };
		}
		if (statRes.qualifierMatch) {
			statisticalQualifier = statRes.qualifierMatch;
			text = statRes.remainderText;
		}
	}

	// 2. Extract Operator if configured
	let operatorMatch: OperatorMatch | undefined;
	if (config.operatorConfig) {
		const opRes: ExtractedOperatorResult = extractOperator(
			text,
			config.operatorConfig,
		);
		if (opRes.operatorMatch) {
			if (policy.allowOperator === false) {
				return {
					diagnostics: [
						{
							code: "operator_not_allowed",
							messageKey: "errors.quantityOperatorNotAllowed",
							messageParams: {
								operator: opRes.operatorMatch.rawText,
							},
						},
					],
				};
			}
			operatorMatch = opRes.operatorMatch;
			text = opRes.remainderText;
		}
	}

	// 3. Check for Range / Chained Delimiters
	if (config.fundamentalGroups) {
		const compiled = compileFundamentalGroups(config.fundamentalGroups);
		const rangeVariants = compiled.variants.filter(
			(variant) => variant.groupId === "range",
		);
		for (const variant of rangeVariants) {
			const extraction = extractFundamental(text, variant);
			if (!extraction || variant.slots.length !== 2) continue;
			if (policy.allowRange === false) {
				return {
					diagnostics: [
						{
							code: "range_not_allowed",
							messageKey: "errors.quantityRangeNotAllowed",
						},
					],
				};
			}
			const start = parseSingleQuantityPart(
				extraction.slots[variant.slots[0]!.id]!,
				config,
			);
			const end = parseSingleQuantityPart(
				extraction.slots[variant.slots[1]!.id]!,
				config,
				start?.unit,
			);
			if (!start || !end) continue;
			const direction: RangeDirection =
				start.magnitude === end.magnitude
					? "equal"
					: start.magnitude < end.magnitude
						? "ascending"
						: "descending";
			if (
				direction === "descending" &&
				policy.allowDirectionalRange === false
			) {
				return {
					diagnostics: [
						{
							code: "descending_range_not_allowed",
							messageKey: "errors.quantityDescendingRangeNotAllowed",
						},
					],
				};
			}
			return {
				value: {
					primaryQuantity: start,
					range: { start, end, direction, rawText },
					...(operatorMatch ? { operator: operatorMatch } : {}),
					...(statisticalQualifier ? { statisticalQualifier } : {}),
					rawText,
				},
				diagnostics: EMPTY_DIAGNOSTICS,
			};
		}
	}
	const rangeDelimiters = config.rangeDelimiters ?? [];
	const descendingDelimiters = config.descendingDelimiters ?? [];
	const allDelimiters = [...rangeDelimiters, ...descendingDelimiters];

	if (!config.fundamentalGroups && allDelimiters.length > 0) {
		const splitResult = splitQuantityRange(text, allDelimiters);
		if (splitResult && splitResult.parts.length >= 2) {
			if (policy.allowRange === false) {
				return {
					diagnostics: [
						{
							code: "range_not_allowed",
							messageKey: "errors.quantityRangeNotAllowed",
						},
					],
				};
			}

			const parts = splitResult.parts;
			if (parts.length > 2 && policy.allowChainedSteps === false) {
				return {
					diagnostics: [
						{
							code: "chained_steps_not_allowed",
							messageKey: "errors.quantityChainedStepsNotAllowed",
						},
					],
				};
			}

			// Parse steps from right to left to inherit unit across steps
			const parsedParts: SingleQuantity[] = [];
			let currentInheritedUnit: string | undefined;
			let rangeParseFailed = false;

			for (let i = parts.length - 1; i >= 0; i--) {
				const partText = parts[i]!;
				const parsed = parseSingleQuantityPart(
					partText,
					config,
					currentInheritedUnit,
				);
				if (!parsed) {
					rangeParseFailed = true;
					break;
				}
				currentInheritedUnit = parsed.unit;
				parsedParts.unshift(parsed);
			}

			if (!rangeParseFailed && parsedParts.length >= 2) {
				// Validate compatibility across steps
				const firstStep = parsedParts[0]!;
				const lastStep = parsedParts[parsedParts.length - 1]!;

				if (policy.allowHeterogeneousUnits === false) {
					const allSame = parsedParts.every((p) => p.unit === firstStep.unit);
					if (!allSame) {
						return {
							diagnostics: [
								{
									code: "heterogeneous_units_not_allowed",
									messageKey: "errors.quantityHeterogeneousUnitsNotAllowed",
								},
							],
						};
					}
				}

				// Validate dimension compatibility if registry present
				if (
					config.conversionRegistry &&
					firstStep.canonicalUnit &&
					lastStep.canonicalUnit
				) {
					const dim1 = config.conversionRegistry.getUnit(
						firstStep.canonicalUnit as UnitId,
					)?.dimension;
					const dim2 = config.conversionRegistry.getUnit(
						lastStep.canonicalUnit as UnitId,
					)?.dimension;
					if (dim1 && dim2 && dim1 !== dim2) {
						return {
							diagnostics: [
								{
									code: "incompatible_range_dimensions",
									messageKey: "errors.quantityIncompatibleRangeDimensions",
									messageParams: {
										dimension1: dim1,
										unit1: firstStep.unit,
										dimension2: dim2,
										unit2: lastStep.unit,
									},
								},
							],
						};
					}
				}

				const isExplicitDescending = descendingDelimiters.includes(
					splitResult.delimiter,
				);
				const startVal = firstStep.canonicalMagnitude ?? firstStep.magnitude;
				const endVal = lastStep.canonicalMagnitude ?? lastStep.magnitude;

				let direction: RangeDirection = "equal";
				if (isExplicitDescending || startVal > endVal) {
					direction = "descending";
				} else if (startVal < endVal) {
					direction = "ascending";
				}

				if (
					direction === "descending" &&
					policy.allowDirectionalRange === false
				) {
					return {
						diagnostics: [
							{
								code: "descending_range_not_allowed",
								messageKey: "errors.quantityDescendingRangeNotAllowed",
							},
						],
					};
				}

				const isHeterogeneous = firstStep.unit !== lastStep.unit;
				const rangeValue: QuantityRange = {
					start: firstStep,
					end: lastStep,
					direction,
					...(isHeterogeneous ? { isHeterogeneousUnits: true } : {}),
					...(parts.length > 2 ? { chainedSteps: parsedParts } : {}),
					rawText,
				};

				const resultValue: QuantityGrammarResult = {
					primaryQuantity: firstStep,
					range: rangeValue,
					...(operatorMatch ? { operator: operatorMatch } : {}),
					...(statisticalQualifier ? { statisticalQualifier } : {}),
					rawText,
				};

				return {
					value: resultValue,
					diagnostics: EMPTY_DIAGNOSTICS,
				};
			}
		}
	}

	// 4. Parse Single Quantity
	const single = parseSingleQuantityPart(text, config);
	if (!single) {
		return {
			diagnostics: [
				{
					code: "invalid_quantity",
					messageKey: "errors.quantityParseFailed",
					messageParams: { text },
				},
			],
		};
	}

	const unitDiags = validateUnitPolicy(single, config, policy);
	if (unitDiags.length > 0) {
		return { diagnostics: unitDiags };
	}

	const resultValue: QuantityGrammarResult = {
		primaryQuantity: single,
		...(operatorMatch ? { operator: operatorMatch } : {}),
		...(statisticalQualifier ? { statisticalQualifier } : {}),
		rawText,
	};

	return {
		value: resultValue,
		diagnostics: EMPTY_DIAGNOSTICS,
	};
}

/**
 * Asynchronously resolves external concept definitions for parsed quantities.
 */
export async function resolveQuantityGrammarAsync(
	result: QuantityGrammarResult,
	config: QuantityGrammarConfig,
): Promise<QuantityGrammarResult> {
	if (!config.conceptResolver) return result;

	const resolveQty = async (qty: SingleQuantity): Promise<SingleQuantity> => {
		if (!qty.conceptDetails || qty.conceptDetails.conceptId) {
			return qty;
		}

		try {
			const res = await config.conceptResolver!(
				qty.conceptDetails.conceptTerm,
				{
					packagingUnit: qty.conceptDetails.packagingUnit,
					locales: config.locales,
				},
			);

			if (res && res.conceptId) {
				const resolvedUnit = res.conceptId;
				let canonicalMagnitude = qty.canonicalMagnitude;
				let canonicalUnit = qty.canonicalUnit;

				if (config.conversionRegistry) {
					try {
						const conv = config.conversionRegistry.convertToCanonicalByUnit(
							resolvedUnit as UnitId,
							qty.magnitude,
						);
						if (conv) {
							canonicalMagnitude = conv.canonicalAmount;
							canonicalUnit = conv.canonicalUnit;
						}
					} catch {
						// Non-fatal
					}
				}

				return {
					...qty,
					unit: resolvedUnit,
					...(canonicalMagnitude !== undefined && canonicalUnit
						? { canonicalUnit, canonicalMagnitude }
						: {}),
					conceptDetails: {
						...qty.conceptDetails,
						conceptId: res.conceptId,
						...(res.standardCode ? { standardCode: res.standardCode } : {}),
						...(res.metadata ? { metadata: res.metadata } : {}),
					},
				};
			}
		} catch {
			// Non-fatal
		}

		return qty;
	};

	const primaryQuantity = await resolveQty(result.primaryQuantity);
	let range = result.range;

	if (range) {
		const start = await resolveQty(range.start);
		const end = await resolveQty(range.end);
		const chainedSteps = range.chainedSteps
			? await Promise.all(range.chainedSteps.map(resolveQty))
			: undefined;

		range = {
			...range,
			start,
			end,
			...(chainedSteps ? { chainedSteps } : {}),
		};
	}

	return {
		...result,
		primaryQuantity,
		...(range ? { range } : {}),
	};
}
