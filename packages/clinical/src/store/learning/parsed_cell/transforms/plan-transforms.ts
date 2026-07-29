import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

// ── InvestigationOrderObject ────────────────────────────────────────────────

const invIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
];

const invTemplate: ParsedItem = {
	targetSchema: "InvestigationOrderObject",
	attributes: {},
	concept: [{ conceptId: "LOINC::57021-8", display: "CBC with Differential" }],
	rawText: "order CBC with diff",
	tag: "InvestigationOrderObject",
	extractedData: {
		concept: { conceptId: "LOINC::57021-8", display: "CBC with Differential" },
		category: "lab",
		priority: "routine",
		status: "ordered",
	},
};

const invColumnSpecs = (() => {
	const flat = flattenParsedItem(invTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const invTransform: ParsedCellRecordTransform = {
	targetSchema: "InvestigationOrderObject",
	template(): ParsedItem {
		return invTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: invIndexes,
	columnSpecs: invColumnSpecs,
};

registerTransform(invTransform);

// ── ReferralOrderObject ──────────────────────────────────────────────────────

const refIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
];

const refTemplate: ParsedItem = {
	targetSchema: "ReferralOrderObject",
	attributes: {},
	concept: [
		{ conceptId: "SNOMED::309343006", display: "Referral to Pulmonologist" },
	],
	rawText: "refer to pulmonology",
	tag: "ReferralOrderObject",
	extractedData: {
		concept: {
			conceptId: "SNOMED::309343006",
			display: "Referral to Pulmonologist",
		},
		specialty: "pulmonology",
		urgency: "routine",
		reason: "refractory asthma exacerbation",
	},
};

const refColumnSpecs = (() => {
	const flat = flattenParsedItem(refTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const refTransform: ParsedCellRecordTransform = {
	targetSchema: "ReferralOrderObject",
	template(): ParsedItem {
		return refTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: refIndexes,
	columnSpecs: refColumnSpecs,
};

registerTransform(refTransform);

// ── InterventionOrderObject ──────────────────────────────────────────────────

const intIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
];

const intTemplate: ParsedItem = {
	targetSchema: "InterventionOrderObject",
	attributes: {},
	concept: [{ conceptId: "SNOMED::229308006", display: "Nebulizer therapy" }],
	rawText: "albuterol nebulizer treatment",
	tag: "InterventionOrderObject",
	extractedData: {
		concept: { conceptId: "SNOMED::229308006", display: "Nebulizer therapy" },
		interventionType: "procedure",
		status: "ordered",
		instructions: "Administer 2.5mg via nebulizerSTAT",
	},
};

const intColumnSpecs = (() => {
	const flat = flattenParsedItem(intTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const intTransform: ParsedCellRecordTransform = {
	targetSchema: "InterventionOrderObject",
	template(): ParsedItem {
		return intTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: intIndexes,
	columnSpecs: intColumnSpecs,
};

registerTransform(intTransform);

// ── SafetyNettingPlan ────────────────────────────────────────────────────────

const safeIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
];

const safeTemplate: ParsedItem = {
	targetSchema: "SafetyNettingPlan",
	attributes: {},
	concept: [],
	rawText: "return if high fever or shortness of breath worsening",
	tag: "SafetyNettingPlan",
	extractedData: {
		redFlagSymptoms: [
			{ conceptId: "SNOMED::267036007", display: "Shortness of breath" },
			{ conceptId: "SNOMED::386661006", display: "Fever" },
		],
		// Explicit floats 3.5 and 7.5 to infer float schema column types
		recommendedReturnTimeframe: { magnitude: 3.5, unit: "days" },
		emergencyInstructions:
			"Go to emergency department if severe distress occurs",
	},
};

const safeColumnSpecs = (() => {
	const flat = flattenParsedItem(safeTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const safeTransform: ParsedCellRecordTransform = {
	targetSchema: "SafetyNettingPlan",
	template(): ParsedItem {
		return safeTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: safeIndexes,
	columnSpecs: safeColumnSpecs,
};

registerTransform(safeTransform);

// ── MilitaryPlanExtension ───────────────────────────────────────────────────

const milIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["disposition"], unique: false },
];

const milTemplate: ParsedItem = {
	targetSchema: "MilitaryPlanExtension",
	attributes: {},
	concept: [],
	rawText: "light duty profile 14 days no lifting > 25 lbs",
	tag: "MilitaryPlanExtension",
	extractedData: {
		disposition: "light_duty",
		dutyLimitations: {
			running: false,
			cycling: true,
			swimming: true,
			// Explicit floats 25.5 and 14.5 to infer FLOAT/REAL SQL type
			max_lifting_lbs: 25.5,
			body_armor_or_helmet: false,
			weapon_handling: false,
			profile_duration_days: 14.5,
		},
	},
};

const milColumnSpecs = (() => {
	const flat = flattenParsedItem(milTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const milTransform: ParsedCellRecordTransform = {
	targetSchema: "MilitaryPlanExtension",
	template(): ParsedItem {
		return milTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: milIndexes,
	columnSpecs: milColumnSpecs,
};

registerTransform(milTransform);
