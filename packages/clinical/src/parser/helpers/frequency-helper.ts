import type { MedicationFrequency, CadenceBaseType, PhysiologicalEventAnchor } from "../../schemas/medication";
import type { TimePrecisionLevel } from "../../schemas/time";
import type { AttributeParserRule, ParserDictionaryRule } from "../../store/interfaces";

export class FrequencyHelper {
	static parse(
		text: string,
		attributeRules: AttributeParserRule[],
		evaluatorRules: ParserDictionaryRule[],
	): MedicationFrequency | null {
		let isPrn = false;
		let cadenceType: CadenceBaseType = "one_time";
		let eventAnchor: PhysiologicalEventAnchor | undefined;
		let interval: { multiplier: number; unit: TimePrecisionLevel } | undefined;
		let rate: { times: number; period: TimePrecisionLevel } | undefined;

		const textLower = text.toLowerCase();

		// 1. Resolve PRN
		for (const rule of attributeRules) {
			if (rule.targetField === "frequency_prn") {
				for (const pattern of rule.regexPatterns) {
					if (new RegExp(pattern, "i").test(textLower)) {
						isPrn = rule.targetValue === "true";
					}
				}
			}
		}

		// 2. Resolve Event Anchor
		for (const rule of attributeRules) {
			if (rule.targetField === "frequency_event_anchor") {
				for (const pattern of rule.regexPatterns) {
					if (new RegExp(pattern, "i").test(textLower)) {
						eventAnchor = rule.targetValue as PhysiologicalEventAnchor;
						cadenceType = "event_anchored";
					}
				}
			}
		}

		// 3. Resolve Shorthands (QD, BID, TID, etc.)
		for (const rule of attributeRules) {
			if (rule.targetField === "frequency_shorthand") {
				for (const pattern of rule.regexPatterns) {
					if (new RegExp(pattern, "i").test(textLower)) {
						cadenceType = "interval";
						let multiplier = 1;
						let unit: TimePrecisionLevel = "day";

						if (rule.targetValue === "BID") {
							// Twice daily maps to interval every 12 hours
							multiplier = 12;
							unit = "hour";
						} else if (rule.targetValue === "TID") {
							// Three times daily maps to interval every 8 hours
							multiplier = 8;
							unit = "hour";
						} else if (rule.targetValue === "QID") {
							multiplier = 6;
							unit = "hour";
						} else {
							// QD maps to multiplier 1 day
							multiplier = 1;
							unit = "day";
						}

						interval = { multiplier, unit };
					}
				}
			}
		}

		// 4. Resolve Evaluator Rules (every X hours, X times per day)
		for (const rule of evaluatorRules) {
			if (rule.targetField === "frequency_details") {
				for (const pattern of rule.regexPatterns) {
					const regex = new RegExp(pattern, "i");
					const match = regex.exec(textLower);
					if (match && match.groups) {
						const rawMult = match.groups.multiplier;
						const rawUnit = match.groups.unit;

						if (rawUnit) {
							// Resolve unit in second pass via attributeRules
							let resolvedUnit: TimePrecisionLevel | undefined;
							for (const attrRule of attributeRules) {
								if (attrRule.targetField === "time_unit") {
									for (const pat of attrRule.regexPatterns) {
										if (new RegExp(pat, "i").test(rawUnit)) {
											resolvedUnit = attrRule.targetValue as TimePrecisionLevel;
											break;
										}
									}
								}
								if (resolvedUnit) break;
							}

							if (resolvedUnit) {
								const times = rawMult ? parseFloat(rawMult) : 1;
								
								// Handle high-frequency "X times per day" conversion (e.g. 3 times per day -> 24 / 3 = every 8 hours)
								if (rule.ruleId === "freq_times" && resolvedUnit === "day" && times > 1) {
									cadenceType = "interval";
									interval = {
										multiplier: Math.round(24 / times),
										unit: "hour",
									};
								} else if (rule.ruleId === "freq_times") {
									// Low-frequency rates: map to rate directly
									cadenceType = "interval";
									rate = {
										times,
										period: resolvedUnit,
									};
								} else {
									cadenceType = "interval";
									interval = {
										multiplier: times,
										unit: resolvedUnit,
									};
								}
							}
						}
					}
				}
			}
		}

		// If nothing else resolved cadence type but isPrn is true, default to one_time PRN
		if (cadenceType === "one_time" && isPrn) {
			cadenceType = "one_time";
		}

		return {
			cadenceType,
			isPrn,
			eventAnchor,
			interval,
			rate,
		};
	}
}
