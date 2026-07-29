import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

// ── ExposureEvent ───────────────────────────────────────────────────────────

const expIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["agent.conceptId"], unique: false },
];

const expTemplate: ParsedItem = {
	targetSchema: "ExposureEvent",
	attributes: {},
	concept: [{ conceptId: "UNII::2P299V784P", display: "Lead" }],
	rawText: "exposure to lead dust",
	tag: "ExposureEvent",
	extractedData: {
		agent: { conceptId: "UNII::2P299V784P", display: "Lead" },
		exposureType: "chemical",
		route: "inhalation",
		duration: { magnitude: 4, unit: "hours" },
	},
};

const expColumnSpecs = (() => {
	const flat = flattenParsedItem(expTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const expTransform: ParsedCellRecordTransform = {
	targetSchema: "ExposureEvent",
	template(): ParsedItem {
		return expTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: expIndexes,
	columnSpecs: expColumnSpecs,
};

registerTransform(expTransform);

// ── MechanicalInjuryObject ──────────────────────────────────────────────────

const injuryIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["concept.conceptId"], unique: false },
];

const injuryTemplate: ParsedItem = {
	targetSchema: "MechanicalInjuryObject",
	attributes: {},
	concept: [{ conceptId: "SNOMED::125605004", display: "Sprain of wrist" }],
	rawText: "right wrist sprain",
	tag: "MechanicalInjuryObject",
	extractedData: {
		concept: { conceptId: "SNOMED::125605004", display: "Sprain of wrist" },
		injuryType: "sprain",
		bodySite: "wrist",
		laterality: "right",
		mechanism: "fall on outstretched hand",
	},
};

const injuryColumnSpecs = (() => {
	const flat = flattenParsedItem(injuryTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const injuryTransform: ParsedCellRecordTransform = {
	targetSchema: "MechanicalInjuryObject",
	template(): ParsedItem {
		return injuryTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: injuryIndexes,
	columnSpecs: injuryColumnSpecs,
};

registerTransform(injuryTransform);

// ── EnvironmentContextObject ────────────────────────────────────────────────

const envIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["contextType"], unique: false },
];

const envTemplate: ParsedItem = {
	targetSchema: "EnvironmentContextObject",
	attributes: {},
	concept: [{ conceptId: "ENV::WORKPLACE", display: "Construction Site" }],
	rawText: "works at construction site",
	tag: "EnvironmentContextObject",
	extractedData: {
		concept: { conceptId: "ENV::WORKPLACE", display: "Construction Site" },
		contextType: "workplace",
		noiseLevel: "high",
		temperatureCelsius: 32,
	},
};

const envColumnSpecs = (() => {
	const flat = flattenParsedItem(envTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const envTransform: ParsedCellRecordTransform = {
	targetSchema: "EnvironmentContextObject",
	template(): ParsedItem {
		return envTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: envIndexes,
	columnSpecs: envColumnSpecs,
};

registerTransform(envTransform);

// ── ProtectiveEquipmentObject ───────────────────────────────────────────────

const ppeIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["equipmentType"], unique: false },
];

const ppeTemplate: ParsedItem = {
	targetSchema: "ProtectiveEquipmentObject",
	attributes: {},
	concept: [{ conceptId: "PPE::EARPLUGS", display: "Earplugs" }],
	rawText: "uses earplugs",
	tag: "ProtectiveEquipmentObject",
	extractedData: {
		concept: { conceptId: "PPE::EARPLUGS", display: "Earplugs" },
		equipmentType: "hearing_protection",
		usageStatus: "always",
	},
};

const ppeColumnSpecs = (() => {
	const flat = flattenParsedItem(ppeTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const ppeTransform: ParsedCellRecordTransform = {
	targetSchema: "ProtectiveEquipmentObject",
	template(): ParsedItem {
		return ppeTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: ppeIndexes,
	columnSpecs: ppeColumnSpecs,
};

registerTransform(ppeTransform);
