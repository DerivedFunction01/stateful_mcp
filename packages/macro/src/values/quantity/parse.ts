import type { UnitId } from "../conversion/contracts";
import { buildNumericPatternString, parseNumericValue } from "../numeric";
import { escapeRegex, getCompiledRegex } from "../regex";
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
	SingleQuantity,
} from "./contracts";
import { resolveUnitAlias } from "./unit-alias";

export function splitQuantityRange(
	text: string,
	delimiters: readonly string[],
): { parts: string[]; delimiter: string } | undefined {
	return splitByDelimiters(text, delimiters, { requireBoundaries: true });
}

export function parseSingleQuantityPart(
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

export function validateUnitPolicy(
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
