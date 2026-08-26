import type { UnitId } from "../conversion/contracts";
import { compileFundamentalGroups, extractFundamental } from "../fundamentals";
import {
	buildNumericPatternString,
	EMPTY_DIAGNOSTICS,
	parseNumericValue,
} from "../numeric";
import {
	type ExtractedOperatorResult,
	extractOperator,
	type OperatorMatch,
} from "../operators";
import type { RecipeEvaluation, RecipeOutputBuilder } from "../recipes";
import { escapeRegex, getCompiledRegex } from "../regex";
import {
	type ExtractedQualifierResult,
	extractStatisticalQualifier,
	type StatisticalQualifier,
} from "../statistics";
import {
	extractPostfixAlias,
	extractPrefixAlias,
	flattenAndSortAliases,
	splitByDelimiters,
} from "../token-matcher";
import type {
	ConceptCountDetails,
	QuantityConsumerPolicy,
	QuantityDiagnostic,
	QuantityGrammarConfig,
	QuantityGrammarResolution,
	QuantityGrammarResult,
	QuantityRange,
	RangeDirection,
	SingleQuantity,
} from "./contracts";

/**
 * Resolves a unit token against user-configured unitAliases, returning the canonical UnitId
 */
export function resolveUnitAlias(
	unitToken: string,
	aliases?: Readonly<Record<string, readonly string[]>>,
	locales?: string | readonly string[],
	fallbackToLiteral = false,
): { canonicalUnit: string; matchedAlias: string } | undefined {
	const trimmed = unitToken.trim();
	if (!trimmed) return undefined;

	if (!aliases) {
		return fallbackToLiteral
			? { canonicalUnit: trimmed, matchedAlias: trimmed }
			: undefined;
	}

	const lower = trimmed.toLocaleLowerCase(locales as string);
	const sorted = flattenAndSortAliases(aliases, true);
	for (const { key, alias } of sorted) {
		if (alias.toLocaleLowerCase(locales as string) === lower) {
			return { canonicalUnit: key, matchedAlias: alias };
		}
	}

	return fallbackToLiteral
		? { canonicalUnit: trimmed, matchedAlias: trimmed }
		: undefined;
}

/** Constructs one quantity from already-bounded, terminal-parsed slots. */
export function createSingleQuantity(
	magnitude: number,
	unitToken: string,
	config: Pick<
		QuantityGrammarConfig,
		"unitAliases" | "locales" | "conversionRegistry"
	> = {},
	rawText: string,
): SingleQuantity | undefined {
	if (!Number.isFinite(magnitude)) return undefined;
	const resolved = resolveUnitAlias(
		unitToken,
		config.unitAliases,
		config.locales,
	);
	if (!resolved) return undefined;
	const quantity: SingleQuantity = {
		magnitude,
		unit: resolved.canonicalUnit,
		rawText: rawText.trim(),
	};
	const canonical = config.conversionRegistry?.convertToCanonicalByUnit(
		resolved.canonicalUnit,
		magnitude,
	);
	return canonical
		? {
				...quantity,
				canonicalUnit: canonical.canonicalUnit,
				canonicalMagnitude: canonical.canonicalAmount,
			}
		: quantity;
}

function evaluationSlot(evaluation: RecipeEvaluation, slotId: string): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	return evaluation.slots[slotId]?.kind === "terminal"
		? evaluation.slots[slotId].value
		: undefined;
}

function firstEvaluationSlot(
	evaluation: RecipeEvaluation,
	name: string,
): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	const key = Object.keys(evaluation.slots).find((slotId) =>
		slotId.startsWith(`${name}_`),
	);
	return key ? evaluationSlot(evaluation, key) : undefined;
}

function quantityFromEvaluation(
	evaluation: RecipeEvaluation,
	config: QuantityGrammarConfig,
	rawText: string,
	amountSlot = "amount",
	unitSlot = "unit",
): SingleQuantity | undefined {
	const amount = evaluationSlot(evaluation, amountSlot);
	const unit = evaluationSlot(evaluation, unitSlot);
	if (typeof amount !== "number" || typeof unit !== "string") return undefined;
	return createSingleQuantity(amount, unit, config, rawText);
}

/** Output builders for authored quantity recipes. */
export function createQuantityOutputBuilders(): Readonly<
	Record<string, RecipeOutputBuilder>
> {
	return {
		"quantity.single": ({ evaluation, input, grammar, policy }) => {
			if (!grammar) return { valid: false };
			const quantity = quantityFromEvaluation(
				evaluation,
				grammar.quantity,
				input,
			);
			if (!quantity) return { valid: false };
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (
				quantityPolicy?.allowedUnits &&
				!quantityPolicy.allowedUnits.includes(quantity.unit)
			)
				return { valid: false };
			return {
				valid: true,
				value: { primaryQuantity: quantity, rawText: input.trim() },
				displayValue: input.trim(),
			};
		},
		"quantity.template": ({ evaluation, input, grammar, policy }) => {
			if (!grammar || evaluation.kind !== "fundamental")
				return { valid: false };
			const amount = firstEvaluationSlot(evaluation, "NUM");
			const explicitUnit = firstEvaluationSlot(evaluation, "UNIT");
			const packaging = firstEvaluationSlot(evaluation, "PKG_CLASSIFIER");
			const unit = explicitUnit ?? packaging;
			if (typeof amount !== "number" || typeof unit !== "string")
				return { valid: false };
			const quantity = createSingleQuantity(
				amount,
				unit,
				grammar.quantity,
				input,
			);
			if (!quantity) return { valid: false };
			const filler = firstEvaluationSlot(evaluation, "FILLER");
			const concept = firstEvaluationSlot(evaluation, "CONCEPT");
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (
				quantityPolicy?.allowedUnits &&
				!quantityPolicy.allowedUnits.includes(quantity.unit)
			)
				return { valid: false };
			const conceptValue =
				concept && typeof concept === "object" && "conceptId" in concept
					? (concept as {
							conceptId: string;
							term?: string;
							standardCode?: string;
							metadata?: Record<string, unknown>;
						})
					: undefined;
			const value: QuantityGrammarResult = {
				primaryQuantity: {
					...quantity,
					conceptDetails: conceptValue
						? {
								conceptTerm:
									conceptValue.term ?? String(conceptValue.conceptId),
								conceptId: conceptValue.conceptId,
								...(packaging ? { packagingUnit: String(packaging) } : {}),
								...(filler ? { fillerConnector: String(filler) } : {}),
								...(conceptValue.standardCode
									? { standardCode: conceptValue.standardCode }
									: {}),
								...(conceptValue.metadata
									? { metadata: conceptValue.metadata }
									: {}),
							}
						: undefined,
				},
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"quantity.range": ({ evaluation, input, grammar, policy }) => {
			if (!grammar || evaluation.kind !== "fundamental")
				return { valid: false };
			const start = evaluationSlot(evaluation, "start");
			const end = evaluationSlot(evaluation, "end");
			if (
				!start ||
				!end ||
				typeof start !== "object" ||
				typeof end !== "object" ||
				!("primaryQuantity" in start) ||
				!("primaryQuantity" in end)
			)
				return { valid: false };
			const startQuantity = (start as QuantityGrammarResult).primaryQuantity;
			const endQuantity = (end as QuantityGrammarResult).primaryQuantity;
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (quantityPolicy?.allowRange === false) return { valid: false };
			if (
				quantityPolicy?.allowedUnits &&
				(!quantityPolicy.allowedUnits.includes(startQuantity.unit) ||
					!quantityPolicy.allowedUnits.includes(endQuantity.unit))
			)
				return { valid: false };
			const direction =
				startQuantity.magnitude < endQuantity.magnitude
					? "ascending"
					: startQuantity.magnitude > endQuantity.magnitude
						? "descending"
						: "equal";
			if (
				direction === "descending" &&
				quantityPolicy?.allowDirectionalRange === false
			)
				return { valid: false };
			const value: QuantityGrammarResult = {
				primaryQuantity: startQuantity,
				range: {
					start: startQuantity,
					end: endQuantity,
					direction,
					rawText: input.trim(),
				},
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
	};
}

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

	let matchedUnit: string | undefined;
	let numericPart = trimmed;
	let conceptDetails: ConceptCountDetails | undefined;

	// 1. Check if part ends with a known unit alias (postfix unit: "500 mg")
	if (config.unitAliases) {
		const sorted = flattenAndSortAliases(config.unitAliases, true);
		const postMatch = extractPostfixAlias(trimmed, sorted, config.locales);
		if (postMatch) {
			numericPart = postMatch.remainderText;
			matchedUnit = postMatch.key;

			// Check if postMatch.remainderText has packaging classifier + filler (e.g. "2 orders of" when matching "happy meal")
			if (config.packagingClassifiers) {
				const numPat = buildNumericPatternString({
					...config.numericConfig,
					...config,
					wrap: false,
				});
				const numMatch = numericPart.match(
					new RegExp(`^(?<num>${numPat})\\s*(?<rest>.+)$`, "u"),
				);
				if (numMatch?.groups?.num && numMatch?.groups?.rest) {
					const candNum = numMatch.groups.num.trim();
					const restText = numMatch.groups.rest.trim();
					const classifierMap: Record<string, readonly string[]> =
						Array.isArray(config.packagingClassifiers)
							? Object.fromEntries(
									config.packagingClassifiers.map((c) => [c, [c]]),
								)
							: (config.packagingClassifiers as Record<
									string,
									readonly string[]
								>);

					const sortedClassifiers = flattenAndSortAliases(classifierMap, true);
					const classMatch = extractPrefixAlias(
						restText,
						sortedClassifiers,
						config.locales,
					);
					if (classMatch) {
						const classifierKey = classMatch.key;
						let connectorMatched: string | undefined;
						let afterClass = classMatch.remainderText;
						if (config.fillerConnectors) {
							const sortedFillers = [...config.fillerConnectors].sort(
								(a, b) => b.length - a.length,
							);
							for (const filler of sortedFillers) {
								const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(filler);
								const pattern = isSymbol
									? `^${escapeRegex(filler)}\\s*`
									: `^${escapeRegex(filler)}(?![\\p{L}\\p{N}])\\s*`;
								const m = afterClass.match(getCompiledRegex(pattern, "iu"));
								if (m) {
									connectorMatched = m[0].trim();
									afterClass = afterClass.slice(m[0].length).trim();
									break;
								}
							}
						}
						if (!afterClass) {
							numericPart = candNum;
							conceptDetails = {
								conceptTerm: postMatch.matchedAlias,
								packagingUnit: classifierKey,
								...(connectorMatched
									? { fillerConnector: connectorMatched }
									: {}),
							};
						}
					}
				}
			}
		} else {
			// Check prefix unit alias (reverse unit order: "mg 500", "bar 4,8")
			const preMatch = extractPrefixAlias(trimmed, sorted, config.locales);
			if (preMatch) {
				numericPart = preMatch.remainderText;
				matchedUnit = preMatch.key;
			}
		}
	}

	// 2. If no unit matched, check split into number + remainder or reverse
	if (!matchedUnit) {
		const numPat = buildNumericPatternString({
			...config.numericConfig,
			...config,
			wrap: false,
		});
		const numPrefixMatch = trimmed.match(
			new RegExp(`^(?<num>${numPat})\\s*(?<rest>[^\\d\\p{Nd}].*)$`, "u"),
		);

		if (numPrefixMatch?.groups?.num && numPrefixMatch?.groups?.rest) {
			const candidateNum = numPrefixMatch.groups.num.trim();
			const remainderText = numPrefixMatch.groups.rest.trim();

			// 2a. Check if remainder is a direct unit alias
			const resolvedDirect = resolveUnitAlias(
				remainderText,
				config.unitAliases,
				config.locales,
			);

			if (resolvedDirect) {
				numericPart = candidateNum;
				matchedUnit = resolvedDirect.canonicalUnit;
			} else {
				// 2b. Check packaging classifiers and filler connectors
				let classifierMatched: string | undefined;
				let classifierKey: string | undefined;
				let textAfterClassifier = remainderText;

				if (config.packagingClassifiers) {
					const classifierMap: Record<string, readonly string[]> =
						Array.isArray(config.packagingClassifiers)
							? Object.fromEntries(
									config.packagingClassifiers.map((c) => [c, [c]]),
								)
							: (config.packagingClassifiers as Record<
									string,
									readonly string[]
								>);

					const sortedClassifiers = flattenAndSortAliases(classifierMap, true);
					const classMatch = extractPrefixAlias(
						remainderText,
						sortedClassifiers,
						config.locales,
					);
					if (classMatch) {
						classifierKey = classMatch.key;
						classifierMatched = classMatch.matchedAlias;
						textAfterClassifier = classMatch.remainderText;
					}
				}

				// 2c. Check filler connectors (e.g. "of", "de", "d'", "von", "的")
				let connectorMatched: string | undefined;
				let conceptTerm = textAfterClassifier;

				if (classifierMatched && config.fillerConnectors) {
					const sortedFillers = [...config.fillerConnectors].sort(
						(a, b) => b.length - a.length,
					);
					for (const filler of sortedFillers) {
						const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(filler);
						const pattern = isSymbol
							? `^${escapeRegex(filler)}\\s*`
							: `^${escapeRegex(filler)}(?![\\p{L}\\p{N}])\\s*`;
						const regex = getCompiledRegex(pattern, "iu");
						const m = textAfterClassifier.match(regex);
						if (m) {
							connectorMatched = m[0].trim();
							conceptTerm = textAfterClassifier.slice(m[0].length).trim();
							break;
						}
					}
				}

				if (conceptTerm || classifierMatched) {
					numericPart = candidateNum;

					// Try resolving combined or packaging unit against registry or aliases
					const combinedTerm = classifierMatched
						? `${classifierMatched} ${connectorMatched ? `${connectorMatched} ` : ""}${conceptTerm}`
						: conceptTerm;

					const resolvedCombined = resolveUnitAlias(
						combinedTerm,
						config.unitAliases,
						config.locales,
					);
					const resolvedConceptOnly = conceptTerm
						? resolveUnitAlias(conceptTerm, config.unitAliases, config.locales)
						: undefined;
					const resolvedClassifierOnly = classifierKey
						? resolveUnitAlias(
								classifierKey,
								config.unitAliases,
								config.locales,
							)
						: undefined;

					let resolvedConceptId: string | undefined;
					let resolvedStandardCode: string | undefined;
					let resolvedMetadata: Record<string, unknown> | undefined;

					// If sync conceptResolver is provided, invoke it
					if (config.conceptResolver && conceptTerm) {
						try {
							const res = config.conceptResolver(conceptTerm, {
								packagingUnit: classifierKey,
								locales: config.locales,
							});
							if (res && !(res instanceof Promise) && "conceptId" in res) {
								resolvedConceptId = res.conceptId;
								resolvedStandardCode = res.standardCode;
								resolvedMetadata = res.metadata;
							}
						} catch {
							// Non-fatal
						}
					}

					matchedUnit =
						resolvedCombined?.canonicalUnit ??
						resolvedConceptId ??
						resolvedConceptOnly?.canonicalUnit ??
						resolvedClassifierOnly?.canonicalUnit ??
						(config.unitAliases
							? classifierKey && conceptTerm
								? `${classifierKey}::${conceptTerm}`
								: (classifierKey ?? conceptTerm)
							: undefined);

					conceptDetails = {
						conceptTerm: conceptTerm || (classifierKey ?? remainderText),
						...(resolvedConceptId ? { conceptId: resolvedConceptId } : {}),
						...(classifierKey ? { packagingUnit: classifierKey } : {}),
						...(connectorMatched ? { fillerConnector: connectorMatched } : {}),
						...(resolvedStandardCode
							? { standardCode: resolvedStandardCode }
							: {}),
						...(resolvedMetadata ? { metadata: resolvedMetadata } : {}),
					};
				}
			}
		}
	}

	// 3. If still no unit, inherit from right-side range context
	if (!matchedUnit && inheritedUnit) {
		numericPart = trimmed;
		matchedUnit = inheritedUnit;
	}

	if (!matchedUnit) {
		return undefined;
	}

	const numRes = parseNumericValue(numericPart, {
		...config.numericConfig,
		...config,
	});
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
		...(conceptDetails ? { conceptDetails } : {}),
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
				messageKey: "errors.quantityUnitNotAllowed",
				messageParams: { unit: qty.unit },
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
				messageKey: "errors.quantityDimensionNotAllowed",
				messageParams: {
					dimension: unitDef.dimension,
					unit: qty.unit,
				},
			});
		}
	}

	if (policy.allowedNamespaces && policy.allowedNamespaces.length > 0) {
		if (qty.unit.includes("::")) {
			const ns = qty.unit.split("::")[0];
			if (ns && !policy.allowedNamespaces.includes(ns)) {
				diagnostics.push({
					code: "namespace_disallowed",
					messageKey: "errors.quantityNamespaceDisallowed",
					messageParams: { namespace: ns, unit: qty.unit },
				});
			}
		}
	}

	return diagnostics;
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
