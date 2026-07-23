import type { ParserDictionaryRule } from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import {
	NamedGroupContractError,
	validateNamedGroups,
} from "../utils/named-group-validator";

export interface VitalsToken {
	anchorText: string;
	systolic?: number;
	diastolic?: number;
	bloodPressureUnit?: string;
	value?: number;
	unit?: string;
}

export class VitalsTokenizer {
	static tokenize(
		content: string,
		evaluatorRules: ParserDictionaryRule[],
	): VitalsToken {
		const capturedProps: Record<string, any> = {};
		let contentCleaned = content;

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(content);
				if (match && match.groups) {
					try {
						validateNamedGroups(match.groups, rule.namedGroupContract);
					} catch (e) {
						if (e instanceof NamedGroupContractError) continue;
						throw e;
					}
					if (rule.targetField === "blood_pressure") {
						const systolicStr = match.groups.systolic;
						const diastolicStr = match.groups.diastolic;
						if (systolicStr && diastolicStr) {
							const systolicVal = Number.parseInt(systolicStr, 10);
							const diastolicVal = Number.parseInt(diastolicStr, 10);
							const unitVal = match.groups.unit?.trim();
							if (!Number.isNaN(systolicVal) && !Number.isNaN(diastolicVal)) {
								capturedProps.systolic = systolicVal;
								capturedProps.diastolic = diastolicVal;
								if (unitVal) capturedProps.bloodPressureUnit = unitVal;
							}
						}
					} else if (rule.targetField === "quantity") {
						const quantityStr = match.groups.quantity;
						if (quantityStr) {
							const quantityVal = Number.parseFloat(quantityStr);
							const unitVal = match.groups.unit;
							if (!Number.isNaN(quantityVal)) {
								capturedProps.value = quantityVal;
								if (unitVal) capturedProps.unit = unitVal;
							}
						}
					}
				}
			}
		}

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}
		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		const anchorText = contentCleaned.trim();

		let value = capturedProps.value;
		let unit = capturedProps.unit;

		if (value === undefined) {
			for (const w of wordsCleaned) {
				const val = Number.parseFloat(w);
				if (!Number.isNaN(val)) {
					value = val;
					const idx = wordsCleaned.indexOf(w);
					if (idx !== -1 && wordsCleaned[idx + 1]) {
						unit = wordsCleaned[idx + 1];
					}
					break;
				}
			}
		}

		return {
			anchorText,
			...capturedProps,
			value,
			unit,
		};
	}
}

export class VitalsHelper {
	static buildBloodPressure(
		systolic: number,
		diastolic: number,
		unit = "mmHg",
	): { systolic: number; diastolic: number; unit: string } {
		return {
			systolic,
			diastolic,
			unit,
		};
	}

	static classifyVitalsSeverity(
		val: number,
		normalMin: number,
		normalMax: number,
	): string {
		if (val < normalMin) return "low";
		if (val > normalMax) return "high";
		return "normal";
	}
}
