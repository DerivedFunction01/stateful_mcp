import type {
	BoundedMeasurement,
	MeasurementUnitAnchor,
	SingleMeasurement,
} from "../../schemas/measurement";
import { isBoundedMeasurement } from "../../schemas/measurement";
import type { CodeableConcept } from "../../schemas/shared";
import type {
	TemporalBoundary,
	TimeMeasurement,
	TimePrecisionLevel,
} from "../../schemas/time";
import {
	DEFAULT_ATTRIBUTE_RULES,
	UNIT_DISPLAY_MAP,
} from "../../store/defaults";
import type { AttributeParserRule } from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";

const ALLOWED_UNITS_SET = new Set(Object.keys(UNIT_DISPLAY_MAP));

export interface QuantityToken {
	magnitude: number;
	rawUnit?: string;
	operator?: string;
	isApproximate?: boolean;
}

export interface PhysicalResolved {
	display: string;
	unitAnchor: MeasurementUnitAnchor;
}

export interface TimeResolved {
	display: TimePrecisionLevel;
}

export type ResolvedUnit = PhysicalResolved | TimeResolved;

export class QuantityTokenizer {
	static tokenize(
		text: string,
		opPatterns?: string[],
		rules?: AttributeParserRule[],
		numericRules?: AttributeParserRule[],
	): QuantityToken | null {
		const trimmed = text.trim();
		const effectiveRules = rules || DEFAULT_ATTRIBUTE_RULES;

		let magnitudeMatch: RegExpExecArray | null = null;
		let magnitudeStr: string | undefined;

		if (numericRules && numericRules.length > 0) {
			const sortedNumeric = [...numericRules].sort((a, b) => {
				const pA = a.priority ?? 10;
				const pB = b.priority ?? 10;
				return pB - pA;
			});
			for (const rule of sortedNumeric) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const regex = getCompiledRegex(pattern, flags);
					const match = regex.exec(trimmed);
					if (match && match[0]) {
						const start = match.index;
						const end = start + match[0].length;
						const before = trimmed[start - 1];
						const after = trimmed[end];
						if (/\d/.test(before ?? "") || /\d/.test(after ?? "")) {
							continue;
						}
						magnitudeStr = match[0];
						magnitudeMatch = match;
						break;
					}
				}
				if (magnitudeStr) break;
			}
		}

		if (!magnitudeStr) {
			magnitudeMatch = /\d+(?:\.\d+)?/.exec(trimmed);
			if (!magnitudeMatch) return null;
			magnitudeStr = magnitudeMatch[0];
		}

		const magnitude = Number.parseFloat(magnitudeStr);
		const magnitudeIndex = magnitudeMatch?.index ?? 0;
		const prefix = trimmed.slice(0, magnitudeIndex).trim();
		const suffix = trimmed.slice(magnitudeIndex + magnitudeStr.length).trim();

		const operatorRules: AttributeParserRule[] = [
			...(opPatterns || []).map((pattern) => ({
				targetField: "operator" as const,
				targetValue: "lt" as const,
				regexPatterns: [pattern],
			})),
			...effectiveRules.filter(
				(rule) =>
					rule.targetField === "operator" ||
					rule.targetField === "measurement_operator",
			),
		];
		const unitRules = effectiveRules.filter(
			(rule) =>
				rule.targetField === "unit" ||
				rule.targetField === "measurement_unit" ||
				rule.targetField === "time_unit",
		);

		let operator: string | undefined;
		let isApproximate = false;
		let rawUnit: string | undefined;

		const strippedPrefix = QuantityTokenizer.stripOperator(
			prefix,
			operatorRules,
		);
		const strippedSuffix = QuantityTokenizer.stripOperator(
			suffix,
			operatorRules,
		);
		if (strippedPrefix.operator) {
			operator = strippedPrefix.operator;
		}
		if (strippedPrefix.isApproximate) {
			isApproximate = true;
		}
		if (strippedSuffix.operator) {
			operator = strippedSuffix.operator;
		}
		if (strippedSuffix.isApproximate) {
			isApproximate = true;
		}

		for (const candidate of [
			{ text: strippedPrefix.segment, source: "prefix" },
			{ text: strippedSuffix.segment, source: "suffix" },
		]) {
			if (!candidate.text) continue;
			const resolvedUnit = QuantityTokenizer.resolveUnit(
				candidate.text,
				unitRules,
			);
			if (resolvedUnit) {
				rawUnit = candidate.text.trim();
				break;
			}
		}

		return {
			magnitude,
			operator,
			isApproximate: isApproximate || undefined,
			rawUnit: rawUnit || undefined,
		};
	}

	private static stripOperator(
		text: string,
		rules: AttributeParserRule[],
	): { segment: string; operator?: string; isApproximate?: boolean } {
		let remaining = text.trim();
		let operator: string | undefined;
		let isApproximate = false;
		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = getCompiledRegex(pattern, flags);
				const match = regex.exec(remaining);
				if (match?.[0]) {
					remaining = remaining.replace(match[0], "").trim();
					if (
						rule.targetValue === "is_approximate" ||
						rule.targetValue === "approximate"
					) {
						isApproximate = true;
					} else {
						operator = rule.targetValue;
					}
					break;
				}
			}
			if (operator || isApproximate) break;
		}
		return {
			segment: remaining,
			operator,
			isApproximate: isApproximate || undefined,
		};
	}

	static parseImplicitGroups(
		groups: Record<string, string>,
	): QuantityToken | null {
		const rawUnit = groups.unit || groups.rawUnit;
		const magStr = groups.magnitude || groups.quantity || groups.value;
		if (rawUnit && magStr) {
			const magnitude = Number.parseFloat(magStr);
			if (!Number.isNaN(magnitude)) {
				return { magnitude, rawUnit };
			}
		}

		// Pattern 2: Implicit Unit Named-Group Capture
		for (const [groupName, value] of Object.entries(groups)) {
			if (value && ALLOWED_UNITS_SET.has(groupName)) {
				const magnitude = Number.parseFloat(value);
				if (!Number.isNaN(magnitude)) {
					return { magnitude, rawUnit: groupName };
				}
			}
		}

		return null;
	}

	static resolveUnit(
		rawUnit: string,
		rules?: AttributeParserRule[],
	): ResolvedUnit | undefined {
		const appliedRules =
			rules && rules.length > 0 ? rules : DEFAULT_ATTRIBUTE_RULES;
		const matchingRules = appliedRules.filter(
			(r) =>
				r.targetField === "unit" ||
				r.targetField === "measurement_unit" ||
				r.targetField === "time_unit",
		);
		const sortedRules = [...matchingRules].sort((a, b) => {
			const pA = a.priority ?? 1;
			const pB = b.priority ?? 1;
			return pB - pA;
		});
		for (const rule of sortedRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				// Check blacklist patterns first
				if (rule.blacklistPatterns) {
					let isBlacklisted = false;
					for (const bp of rule.blacklistPatterns) {
						const reBlacklist = getCompiledRegex(bp, flags);
						if (reBlacklist.test(rawUnit)) {
							isBlacklisted = true;
							break;
						}
					}
					if (isBlacklisted) {
						continue;
					}
				}
				const regex = getCompiledRegex(pattern, flags);
				if (regex.test(rawUnit)) {
					if (rule.unitAnchor) {
						return {
							display: rule.targetValue,
							unitAnchor: rule.unitAnchor as MeasurementUnitAnchor,
						};
					}
					return { display: rule.targetValue as TimePrecisionLevel };
				}
			}
		}
		return undefined;
	}
}

export class QuantityHelper {
	static isPhysicalResolved(u: ResolvedUnit): u is PhysicalResolved {
		return "unitAnchor" in u;
	}

	static isTimeResolved(u: ResolvedUnit): u is TimeResolved {
		return !("unitAnchor" in u);
	}
}

export interface MeasurementToken {
	operator?: string;
	magnitude: number;
	rawUnit?: string;
	isApproximate?: boolean;
}

export class MeasurementHelper {
	static parse(
		token: QuantityToken,
		defaultUnit?: string,
		attributeRules?: AttributeParserRule[],
	): BoundedMeasurement | SingleMeasurement | null {
		const rules =
			attributeRules && attributeRules.length > 0
				? attributeRules
				: DEFAULT_ATTRIBUTE_RULES;

		let resolved: PhysicalResolved | undefined;
		if (token.rawUnit) {
			resolved = QuantityTokenizer.resolveUnit(token.rawUnit, rules) as
				| PhysicalResolved
				| undefined;
		}
		const unitDisplay = resolved?.display || defaultUnit;
		const unit: CodeableConcept | undefined = unitDisplay
			? { display: unitDisplay }
			: undefined;

		let operator: SingleMeasurement["operator"] = "eq";
		if (token.operator) {
			operator = token.operator as TimeMeasurement["operator"];
		}

		const base: SingleMeasurement = {
			magnitude: token.magnitude,
			operator,
			is_approximate: token.isApproximate || undefined,
			unit,
		};

		if (resolved?.unitAnchor) {
			return { ...base, unitAnchor: resolved.unitAnchor } as BoundedMeasurement;
		}
		return base;
	}

	static parseAs<T extends BoundedMeasurement>(
		token: QuantityToken,
		anchor: T["unitAnchor"],
		attributeRules?: AttributeParserRule[],
	): T | null {
		const parsed = MeasurementHelper.parse(token, undefined, attributeRules);
		if (!parsed) return null;
		if (isBoundedMeasurement(parsed) && parsed.unitAnchor === anchor) {
			return parsed as unknown as T;
		}
		return null;
	}
}

export interface TimeToken {
	magnitude: number;
	rawUnit?: string;
}

export class TimeHelper {
	static parse(
		token: QuantityToken,
		attributeRules?: AttributeParserRule[],
	): TimeMeasurement | null {
		const rules =
			attributeRules && attributeRules.length > 0
				? attributeRules
				: DEFAULT_ATTRIBUTE_RULES;

		let resolved: TimeResolved | undefined;
		if (token.rawUnit) {
			resolved = QuantityTokenizer.resolveUnit(token.rawUnit, rules) as
				| TimeResolved
				| undefined;
		}
		if (!resolved) return null;

		let operator: TimeMeasurement["operator"] = "eq";
		if (token.operator) {
			operator = token.operator as TimeMeasurement["operator"];
		}

		const base: TimeMeasurement = {
			magnitude: token.magnitude,
			operator,
			is_approximate: token.isApproximate || undefined,
			unit: resolved.display,
		};
		return base;
	}

	static getCurrentTimestamp(
		precisionLevel: TimePrecisionLevel = "second",
		seedTime?: Date | string | number,
	): TemporalBoundary {
		const referenceTime =
			seedTime === undefined ? new Date() : new Date(seedTime);
		if (Number.isNaN(referenceTime.getTime())) {
			throw new Error(
				"Invalid seedTime provided to TimeHelper.getCurrentTimestamp",
			);
		}

		return {
			assertedTimestampUtc: referenceTime.toISOString(),
			precisionLevel,
		};
	}
}
