import type { AttributeParserRule } from "../../store/interfaces";
import { DEFAULT_ATTRIBUTE_RULES } from "../../store/defaults";
import type { CodeableConcept } from "../../schemas/shared";
import type {
	BoundedMeasurement,
	SingleMeasurement,
	MeasurementUnitAnchor,
} from "../../schemas/measurement";
import type {
	TimeMeasurement,
	TimePrecisionLevel,
} from "../../schemas/time";

export interface MeasurementToken {
	operator?: string;
	magnitude: number;
	rawUnit?: string;
	isApproximate?: boolean;
}

export class MeasurementHelper {
	static tokenizeMeasurement(
		text: string,
		opPatterns: string[],
		unitRules?: AttributeParserRule[],
	): MeasurementToken | null {
		const trimmed = text.trim();
		const sortedPatterns = opPatterns
			.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.sort((a, b) => b.length - a.length);

		const opPart = sortedPatterns.length > 0 ? `(?:(?<operator>${sortedPatterns.join("|")}))?` : "";
		const regexStr = `^${opPart}\\s*(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<remaining>.*)$`;
		const regex = new RegExp(regexStr, "i");
		const match = regex.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const remaining = match.groups?.remaining?.trim() || "";

		const rawOp = match.groups?.operator || "";
		let operator: string | undefined;
		let isApproximate = false;

		if (rawOp) {
			const rules = unitRules || DEFAULT_ATTRIBUTE_RULES;
			const opRules = rules.filter(r => r.targetField === "operator" || r.targetField === "measurement_operator");
			let resolved = false;
			for (const rule of opRules) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const regex = new RegExp(pattern, flags);
					if (regex.test(rawOp)) {
						if (rule.targetValue === "is_approximate" || rule.targetValue === "approximate") {
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

	static resolveUnit(
		unitDisplay: string,
		unitRules?: AttributeParserRule[],
	): { display: string; unitAnchor?: MeasurementUnitAnchor } {
		const rules = unitRules && unitRules.length > 0 ? unitRules : DEFAULT_ATTRIBUTE_RULES;
		const matchingRules = rules.filter(r => r.targetField === "unit" || r.targetField === "measurement_unit");
		for (const rule of matchingRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(unitDisplay)) {
					return {
						display: rule.targetValue,
						unitAnchor: rule.unitAnchor as MeasurementUnitAnchor | undefined,
					};
				}
			}
		}
		return { display: unitDisplay };
	}

	static parse(
		text: string,
		defaultUnit?: string,
		attributeRules?: AttributeParserRule[],
	): BoundedMeasurement | SingleMeasurement | null {
		const rules = attributeRules && attributeRules.length > 0 ? attributeRules : DEFAULT_ATTRIBUTE_RULES;
		const opRules = rules.filter(r => r.targetField === "operator" || r.targetField === "measurement_operator");
		const opPatterns = opRules.flatMap(r => r.regexPatterns);

		const token = MeasurementHelper.tokenizeMeasurement(text, opPatterns, rules);
		if (!token) return null;

		let resolved: { display: string; unitAnchor?: MeasurementUnitAnchor } | undefined;
		if (token.rawUnit) {
			resolved = MeasurementHelper.resolveUnit(token.rawUnit, rules);
		}
		const unitDisplay = resolved?.display || defaultUnit;
		const unit: CodeableConcept | undefined = unitDisplay
			? { display: unitDisplay }
			: undefined;

		let operator: SingleMeasurement["operator"] = "eq";
		if (token.operator === "gt" || token.operator === "gte" || token.operator === "lt" || token.operator === "lte" || token.operator === "eq") {
			operator = token.operator;
		}

		const base: SingleMeasurement = {
			magnitude: token.magnitude,
			operator,
			is_approximate: token.isApproximate || undefined,
			unit,
		};

		// Promote to BoundedMeasurement when the unit rule carried a dimension anchor.
		if (resolved?.unitAnchor) {
			return { ...base, unitAnchor: resolved.unitAnchor } as BoundedMeasurement;
		}
		return base;
	}
}

export interface TimeToken {
	magnitude: number;
	rawUnit?: string;
}

export class TimeHelper {
	static tokenizeTime(text: string): TimeToken | null {
		const trimmed = text.trim();
		const match = /^(?<magnitude>\d+(?:\.\d+)?)\s*(?<rawUnit>.*)$/.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const rawUnit = match.groups?.rawUnit?.trim() || "";

		return {
			magnitude,
			rawUnit: rawUnit || undefined,
		};
	}

	static resolveTimeUnit(
		rawUnit: string,
		timeUnitRules?: AttributeParserRule[],
	): TimePrecisionLevel | undefined {
		const rules = timeUnitRules && timeUnitRules.length > 0 ? timeUnitRules : DEFAULT_ATTRIBUTE_RULES;
		const matchingRules = rules.filter(r => r.targetField === "time_unit" || r.targetField === "unit");
		for (const rule of matchingRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(rawUnit)) {
					return rule.targetValue as TimePrecisionLevel;
				}
			}
		}
		return undefined;
	}

	static parse(
		text: string,
		attributeRules?: AttributeParserRule[],
	): TimeMeasurement | null {
		const token = TimeHelper.tokenizeTime(text);
		if (!token) return null;

		let unit: TimePrecisionLevel | undefined;
		if (token.rawUnit) {
			unit = TimeHelper.resolveTimeUnit(token.rawUnit, attributeRules);
		}

		return {
			magnitude: token.magnitude,
			unit,
		};
	}
}
