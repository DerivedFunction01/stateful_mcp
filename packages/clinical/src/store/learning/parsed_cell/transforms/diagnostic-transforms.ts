import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

// ── PhysicalExamObject ──────────────────────────────────────────────────────

const peIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["system"], unique: false },
];

const peTemplate: ParsedItem = {
	targetSchema: "PhysicalExamObject",
	attributes: {},
	concept: [{ conceptId: "PE::RESPIRATORY", display: "Respiratory Exam" }],
	rawText: "clear to auscultation bilaterally",
	tag: "PhysicalExamObject",
	extractedData: {
		system: "respiratory",
		findings: [
			{
				finding: {
					conceptId: "SNOMED::301252002",
					display: "Clear breath sounds",
				},
				isNormal: true,
			},
		],
	},
};

const peColumnSpecs = (() => {
	const flat = flattenParsedItem(peTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const peTransform: ParsedCellRecordTransform = {
	targetSchema: "PhysicalExamObject",
	template(): ParsedItem {
		return peTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: peIndexes,
	columnSpecs: peColumnSpecs,
};

registerTransform(peTransform);

// ── LabPanelResult ──────────────────────────────────────────────────────────

const labIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["panelName"], unique: false },
];

const labTemplate: ParsedItem = {
	targetSchema: "LabPanelResult",
	attributes: {},
	concept: [
		{ conceptId: "LOINC::24323-8", display: "Comprehensive Metabolic Panel" },
	],
	rawText: "CMP panel normal",
	tag: "LabPanelResult",
	extractedData: {
		panelName: "CMP",
		specimenType: "blood",
		analytes: [
			{
				analyte: { conceptId: "LOINC::2951-2", display: "Sodium" },
				// Float value 140.5 to infer FLOAT/REAL type for lab analyte values
				value: 140.5,
				unit: "mmol/L",
				referenceRange: { low: 135.5, high: 145.5 },
				interpretation: "normal",
			},
		],
	},
};

const labColumnSpecs = (() => {
	const flat = flattenParsedItem(labTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const labTransform: ParsedCellRecordTransform = {
	targetSchema: "LabPanelResult",
	template(): ParsedItem {
		return labTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: labIndexes,
	columnSpecs: labColumnSpecs,
};

registerTransform(labTransform);

// ── DeviceDiagnosticObject ──────────────────────────────────────────────────

const diagnosticIndexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["modality"], unique: false },
];

const diagnosticTemplate: ParsedItem = {
	targetSchema: "DeviceDiagnosticObject",
	attributes: {},
	concept: [{ conceptId: "DICOM::DX", display: "Chest X-Ray 2 Views" }],
	rawText: "chest xray clear",
	tag: "DeviceDiagnosticObject",
	extractedData: {
		modality: "XRAY",
		bodySite: "chest",
		interpretation: "normal",
		dicomStudyUid: "1.2.840.10008.5.1.4.1.1.1",
		findings: ["no focal consolidation", "heart size normal"],
	},
};

const diagnosticColumnSpecs = (() => {
	const flat = flattenParsedItem(diagnosticTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const diagnosticTransform: ParsedCellRecordTransform = {
	targetSchema: "DeviceDiagnosticObject",
	template(): ParsedItem {
		return diagnosticTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: diagnosticIndexes,
	columnSpecs: diagnosticColumnSpecs,
};

registerTransform(diagnosticTransform);
