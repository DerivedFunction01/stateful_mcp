import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

// ── PrimaryDiagnosisEntry ───────────────────────────────────────────────────

const primaryDxIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["diagnosis.conceptId"], unique: false },
];

const primaryDxTemplate: ParsedItem = {
	targetSchema: "PrimaryDiagnosisEntry",
	attributes: {},
	concept: [{ conceptId: "ICD10::J45.909", display: "Asthma, unspecified" }],
	rawText: "asthma exacerbation",
	tag: "PrimaryDiagnosisEntry",
	extractedData: {
		diagnosis: { conceptId: "ICD10::J45.909", display: "Asthma, unspecified" },
		acuityLevel: "acute",
		supportingConcepts: [
			{ conceptId: "LOINC::9303-9", display: "Respiration rate" },
		],
		comorbidities: [
			{ conceptId: "ICD10::I10", display: "Essential hypertension" },
		],
		anatomyLocations: [
			{
				anatomy: {
					conceptId: "SNOMED::82094008",
					display: "Lower respiratory tract",
				},
			},
		],
		relatedMedications: [
			{ conceptId: "RxNorm::2123111", display: "Albuterol" },
		],
	},
};

const primaryDxColumnSpecs = (() => {
	const flat = flattenParsedItem(primaryDxTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const primaryDxTransform: ParsedCellRecordTransform = {
	targetSchema: "PrimaryDiagnosisEntry",
	template(): ParsedItem {
		return primaryDxTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: primaryDxIndexes,
	columnSpecs: primaryDxColumnSpecs,
};

registerTransform(primaryDxTransform);

// ── DifferentialDiagnosisEntry ───────────────────────────────────────────────

const diffDxIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["diagnosis.conceptId"], unique: false },
	{ columns: ["rank"], unique: false },
];

const diffDxTemplate: ParsedItem = {
	targetSchema: "DifferentialDiagnosisEntry",
	attributes: {},
	concept: [{ conceptId: "ICD10::J18.9", display: "Pneumonia, unspecified" }],
	rawText: "rule out pneumonia",
	tag: "DifferentialDiagnosisEntry",
	extractedData: {
		rank: 1.5, // Explicit float to map as REAL/FLOAT
		diagnosis: { conceptId: "ICD10::J18.9", display: "Pneumonia, unspecified" },
		confidence: "possible",
		supportingConcepts: [{ conceptId: "SNOMED::386661006", display: "Fever" }],
		refutingConcepts: [
			{ conceptId: "SNOMED::84229001", display: "Normal chest X-ray" },
		],
		relatedMedications: [],
		anatomyLocations: [
			{ anatomy: { conceptId: "SNOMED::39607008", display: "Lung" } },
		],
	},
};

const diffDxColumnSpecs = (() => {
	const flat = flattenParsedItem(diffDxTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const diffDxTransform: ParsedCellRecordTransform = {
	targetSchema: "DifferentialDiagnosisEntry",
	template(): ParsedItem {
		return diffDxTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: diffDxIndexes,
	columnSpecs: diffDxColumnSpecs,
};

registerTransform(diffDxTransform);

// ── AlgorithmicEvaluationObject ─────────────────────────────────────────────

const algoIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["evaluationType"], unique: false },
];

const algoTemplate: ParsedItem = {
	targetSchema: "AlgorithmicEvaluationObject",
	attributes: {},
	concept: [{ conceptId: "ALGO::CURB65", display: "CURB-65 Score" }],
	rawText: "CURB-65 score 2",
	tag: "AlgorithmicEvaluationObject",
	extractedData: {
		evaluationType: "clinical_risk_score",
		algorithm: { conceptId: "ALGO::CURB65", display: "CURB-65 Score" },
		hypothesesAndOutputs: [
			{
				concept: { conceptId: "ALGO::CURB65_HIGH", display: "High Risk" },
				scoreValue: { magnitude: 2.5, display: "points" },
			},
		],
		severityTier: "warning_soft_stop",
		overrideStatus: {
			isOverridden: false,
			justificationText: "Patient is clinically stable",
		},
	},
};

const algoColumnSpecs = (() => {
	const flat = flattenParsedItem(algoTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const algoTransform: ParsedCellRecordTransform = {
	targetSchema: "AlgorithmicEvaluationObject",
	template(): ParsedItem {
		return algoTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: algoIndexes,
	columnSpecs: algoColumnSpecs,
};

registerTransform(algoTransform);
