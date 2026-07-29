import type { AutocompleteFeature } from "../../store/learning/interfaces";
import type { CodeableConcept } from "../../schemas/shared";
import { computeValueInBase } from "./measurement-conversion";
import type { MeasurementUnitAnchor } from "../../schemas/measurement";

/**
 * Helper to extract Concept features.
 * Format: key="concept", value="<conceptId>"
 */
export function extractConceptFeature(value: unknown): AutocompleteFeature[] {
	if (!value) return [];
	const features: AutocompleteFeature[] = [];

	// Check if it's a CodeableConcept shape
	if (typeof value === "object") {
		const valObj = value as Record<string, any>;
		if (Array.isArray(valObj.concept)) {
			for (const c of valObj.concept) {
				if (c && typeof c === "object" && c.conceptId) {
					features.push({
						key: "concept",
						value: c.conceptId,
						numericalValue: null,
					});
				}
			}
		} else if (valObj.conceptId) {
			features.push({
				key: "concept",
				value: valObj.conceptId,
				numericalValue: null,
			});
		}
	} else if (typeof value === "string") {
		// If it's a plain string that looks like a concept id
		if (value.includes("::")) {
			features.push({
				key: "concept",
				value,
				numericalValue: null,
			});
		}
	}
	return features;
}

/**
 * Helper to extract Measurement features.
 * Format: key="measurement:<anchor>", numericalValue=<baseConvertedValue>
 */
export function extractMeasurementFeature(value: unknown): AutocompleteFeature[] {
	if (!value || typeof value !== "object") return [];
	const valObj = value as Record<string, any>;

	// Expecting { magnitude: number, unit: string, anchor: MeasurementUnitAnchor }
	if (
		typeof valObj.magnitude === "number" &&
		typeof valObj.unit === "string" &&
		typeof valObj.anchor === "string"
	) {
		const baseVal = computeValueInBase(
			valObj.anchor as MeasurementUnitAnchor,
			valObj.unit,
			valObj.magnitude,
		);
		if (baseVal !== undefined) {
			return [
				{
					key: `measurement:${valObj.anchor}`,
					value: null,
					numericalValue: baseVal,
				},
			];
		}
	}
	return [];
}

/**
 * Helper to extract Object features.
 * Format: key="obj_key:<subKey>=<subValue>"
 */
export function extractObjectFeatures(value: unknown): AutocompleteFeature[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	const valObj = value as Record<string, any>;
	const features: AutocompleteFeature[] = [];

	for (const [k, v] of Object.entries(valObj)) {
		// skip standard keys or sub-objects/arrays
		if (k === "concept" || k === "anchor" || k === "unit" || k === "magnitude") {
			continue;
		}
		if (v !== null && typeof v !== "object") {
			features.push({
				key: `obj_key:${k}`,
				value: String(v),
				numericalValue: null,
			});
		}
	}
	return features;
}

/**
 * Helper to extract Term features.
 * Format: key="term", value="<lowercase_word>" (filtered by StopWords)
 */
export function extractTermFeatures(
	value: string,
	stopWords?: Set<string>,
): AutocompleteFeature[] {
	if (!value) return [];
	const words = value
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.split(/\s+/);

	const features: AutocompleteFeature[] = [];
	for (const w of words) {
		const trimmed = w.trim();
		if (!trimmed) continue;
		if (stopWords && stopWords.has(trimmed)) continue;
		features.push({
			key: "term",
			value: trimmed,
			numericalValue: null,
		});
	}
	return features;
}

/**
 * Combined feature extractor
 */
export function extractFeatures(
	value: unknown,
	stopWords?: Set<string>,
): AutocompleteFeature[] {
	if (value === null || value === undefined) return [];

	const features: AutocompleteFeature[] = [];

	// 1. Concept features
	features.push(...extractConceptFeature(value));

	// 2. Measurement features
	features.push(...extractMeasurementFeature(value));

	// 3. Flat object properties
	features.push(...extractObjectFeatures(value));

	// 4. String term token features
	if (typeof value === "string") {
		features.push(...extractTermFeatures(value, stopWords));
	} else if (typeof value === "object" && typeof (value as any).rawText === "string") {
		features.push(...extractTermFeatures((value as any).rawText, stopWords));
	}

	return features;
}
