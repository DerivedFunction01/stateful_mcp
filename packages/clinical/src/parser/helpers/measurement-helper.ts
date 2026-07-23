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
import { DEFAULT_ATTRIBUTE_RULES, UNIT_DISPLAY_MAP } from "../../store/defaults";
import type { AttributeParserRule } from "../../store/interfaces";

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
	): QuantityToken | null {
		const trimmed = text.trim();
		const sortedPatterns = (opPatterns || [])
			.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.sort((a, b) => b.length - a.length);

		const opPart =
			sortedPatterns.length > 0
				? `(?:(?<operator>${sortedPatterns.join("|")}))?`
				: "";

		const regexStr = `${opPart}\\s*(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<remaining>.*)`;
		const regex = new RegExp(regexStr, "i");

		let match = regex.exec(trimmed);
		if (!match) {
			const numberRegex = /\d+(?:\.\d+)?/g;
			let numMatch;
			while ((numMatch = numberRegex.exec(trimmed)) !== null) {
				const candidate = trimmed.substring(numMatch.index);
				const innerMatch = regex.exec(candidate);
				if (innerMatch) {
					match = innerMatch;
					break;
				}
			}
		}

		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const remaining = match.groups?.remaining?.trim() || "";

		const rawOp = match.groups?.operator || "";
		let operator: string | undefined;
		let isApproximate = false;

		if (rawOp) {
			const opRules = (rules || DEFAULT_ATTRIBUTE_RULES).filter(
				(r) =>
					r.targetField === "operator" ||
					r.targetField === "measurement_operator",
			);
			let resolved = false;
			for (const rule of opRules) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const re = new RegExp(pattern, flags);
					if (re.test(rawOp)) {
						if (
							rule.targetValue === "is_approximate" ||
							rule.targetValue === "approximate"
						) {
							isApproximate = true;
						} else {
							operator = rule.targetValue;
						}
						resolved = true;
						break;
					}
				}
				if (resolved) break;
			}
		}

		return {
			magnitude,
			operator,
			isApproximate: isApproximate || undefined,
			rawUnit: remaining || undefined,
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
		for (const rule of matchingRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
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
		if (
			token.operator === "gt" ||
			token.operator === "gte" ||
			token.operator === "lt" ||
			token.operator === "lte" ||
			token.operator === "eq"
		) {
			operator = token.operator;
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
		if (
			token.operator === "gt" ||
			token.operator === "gte" ||
			token.operator === "lt" ||
			token.operator === "lte" ||
			token.operator === "eq"
		) {
			operator = token.operator;
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
	): TemporalBoundary {
		return {
			assertedTimestampUtc: new Date().toISOString(),
			precisionLevel,
		};
	}
}
