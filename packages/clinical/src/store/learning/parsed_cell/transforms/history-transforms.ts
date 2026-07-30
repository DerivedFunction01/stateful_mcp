import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

// ── AllergyEntry ────────────────────────────────────────────────────────────

const allergyIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
	{ columns: ["category"], unique: false },
];

const allergyTemplate: ParsedItem = {
	targetSchema: "AllergyEntry",
	attributes: {},
	concept: [{ conceptId: "RxNorm::70618", display: "Penicillin" }],
	rawText: "allergy to penicillin",
	tag: "AllergyEntry",
	extractedData: {
		substance: { conceptId: "RxNorm::70618", display: "Penicillin" },
		reactionType: [{ conceptId: "SNOMED::247472004", display: "Hives" }],
		allergySeverity: "severe",
		verificationStatus: "confirmed",
	},
};

const allergyColumnSpecs = (() => {
	const flat = flattenParsedItem(allergyTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const allergyTransform: ParsedCellRecordTransform = {
	targetSchema: "AllergyEntry",
	template(): ParsedItem {
		return allergyTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: allergyIndexes,
	columnSpecs: allergyColumnSpecs,
};

registerTransform(allergyTransform);

// ── SocialHistoryEntry ──────────────────────────────────────────────────────

const socialIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
];

const socialTemplate: ParsedItem = {
	targetSchema: "SocialHistoryEntry",
	attributes: {},
	concept: [{ conceptId: "SNOMED::77176002", display: "Smoker" }],
	rawText: "tobacco use 1 pack per day",
	tag: "SocialHistoryEntry",
	extractedData: {
		category: { conceptId: "SNOMED::77176002", display: "Smoker" },
		status: "current",
		quantity: "1 pack per day",
		notes: "tobacco use 1 pack per day",
	},
};

const socialColumnSpecs = (() => {
	const flat = flattenParsedItem(socialTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const socialTransform: ParsedCellRecordTransform = {
	targetSchema: "SocialHistoryEntry",
	template(): ParsedItem {
		return socialTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: socialIndexes,
	columnSpecs: socialColumnSpecs,
};

registerTransform(socialTransform);

// ── ReportedMedicationEntry ─────────────────────────────────────────────────

const reportedMedIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["medication.conceptId"], unique: false },
];

const reportedMedTemplate: ParsedItem = {
	targetSchema: "ReportedMedicationEntry",
	attributes: {},
	concept: [
		{ conceptId: "RxNorm::860975", display: "Lisinopril 10 MG Oral Tablet" },
	],
	rawText: "taking lisinopril 10mg daily",
	tag: "ReportedMedicationEntry",
	extractedData: {
		medication: {
			conceptId: "RxNorm::860975",
			display: "Lisinopril 10 MG Oral Tablet",
		},
		status: "active",
		adherence: "always",
		dosage: { text: "10mg", dose: 10, unit: "mg" },
	},
};

const reportedMedColumnSpecs = (() => {
	const flat = flattenParsedItem(reportedMedTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const reportedMedTransform: ParsedCellRecordTransform = {
	targetSchema: "ReportedMedicationEntry",
	template(): ParsedItem {
		return reportedMedTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: reportedMedIndexes,
	columnSpecs: reportedMedColumnSpecs,
};

registerTransform(reportedMedTransform);
