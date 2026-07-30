import { inferSqlType } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

const indexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["vitalType.conceptId"], unique: false },
];

const vitalsTemplate: ParsedItem = {
	targetSchema: "VitalsMeasurementEvent",
	attributes: {},
	concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
	rawText: "temp 37.5C",
	tag: "VitalsMeasurementEvent",
	extractedData: {
		vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
		measurement: {
			magnitude: 37.5,
			unitAnchor: "temperature",
			unit: { display: "Celsius" },
			valueInBase: 310.15,
		},
	},
};

const vitalsColumnSpecs = (() => {
	const flat = flattenParsedItem(vitalsTemplate);
	delete flat.id;
	delete flat.soapSection;
	delete flat.rawTerm;
	delete flat.dateRange;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const transform: ParsedCellRecordTransform = {
	targetSchema: "VitalsMeasurementEvent",
	template(): ParsedItem {
		return vitalsTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);

		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;

		return flat;
	},
	indexes,
	columnSpecs: vitalsColumnSpecs,
};

registerTransform(transform);

function createVitalTransform(
	targetSchema: string,
	tag: string,
	category: string,
	concept: { conceptId: string; display: string },
	measurement: Record<string, any>,
): ParsedCellRecordTransform {
	const template: ParsedItem = {
		targetSchema,
		attributes: {},
		concept: [concept],
		rawText: "",
		tag,
		extractedData: {
			vitalType: concept,
			category,
			measurement,
		},
	};

	const columnSpecs = (() => {
		const flat = flattenParsedItem(template);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return Object.entries(flat).map(([name, value]) => ({
			name,
			type: inferSqlType(value),
		}));
	})();

	return {
		targetSchema,
		template(): ParsedItem {
			return template;
		},
		flatten(parsedItem) {
			const flat = flattenParsedItem(parsedItem as ParsedItem);
			delete flat.id;
			delete flat.soapSection;
			delete flat.rawTerm;
			delete flat.dateRange;
			return flat;
		},
		indexes: [
			{ columns: ["recencyScore"], unique: false },
			{ columns: ["vitalType.conceptId"], unique: false },
		],
		columnSpecs,
	};
}

function createBloodPressureTransform(
	concept: { conceptId: string; display: string },
	systolic: number,
	diastolic: number,
): ParsedCellRecordTransform {
	const bpSystolic = { magnitude: systolic, unit: { display: "mmHg" } };
	const bpDiastolic = { magnitude: diastolic, unit: { display: "mmHg" } };
	const template: ParsedItem = {
		targetSchema: "BloodPressureVitalEvent",
		attributes: {},
		concept: [concept],
		rawText: `BP ${systolic}/${diastolic}`,
		tag: "BloodPressureVitalEvent",
		extractedData: {
			vitalType: concept,
			category: "blood_pressure",
			systolic: bpSystolic,
			diastolic: bpDiastolic,
		},
	};

	const columnSpecs = (() => {
		const flat = flattenParsedItem(template);
		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;
		return Object.entries(flat).map(([name, value]) => ({
			name,
			type: inferSqlType(value),
		}));
	})();

	return {
		targetSchema: "BloodPressureVitalEvent",
		template(): ParsedItem {
			return template;
		},
		flatten(parsedItem) {
			const flat = flattenParsedItem(parsedItem as ParsedItem);
			delete flat.id;
			delete flat.soapSection;
			delete flat.rawTerm;
			delete flat.dateRange;
			return flat;
		},
		indexes: [
			{ columns: ["recencyScore"], unique: false },
			{ columns: ["vitalType.conceptId"], unique: false },
		],
		columnSpecs,
	};
}

registerTransform(
	createBloodPressureTransform(
		{ conceptId: "LOINC::55284-4", display: "Blood pressure" },
		120,
		80,
	),
);

registerTransform(
	createVitalTransform(
		"TemperatureVitalEvent",
		"TemperatureVitalEvent",
		"temperature",
		{ conceptId: "LOINC::8310-5", display: "Temperature" },
		{
			magnitude: 37.5,
			unitAnchor: "temperature",
			unit: { display: "Celsius" },
			valueInBase: 310.15,
		},
	),
);

registerTransform(
	createVitalTransform(
		"HeartRateVitalEvent",
		"HeartRateVitalEvent",
		"pulse",
		{ conceptId: "LOINC::8867-4", display: "Heart rate" },
		{ magnitude: 72, unitAnchor: "pulse", unit: { display: "/min" } },
	),
);

registerTransform(
	createVitalTransform(
		"RespiratoryRateVitalEvent",
		"RespiratoryRateVitalEvent",
		"respiration",
		{ conceptId: "LOINC::9279-1", display: "Respiratory rate" },
		{ magnitude: 16, unitAnchor: "respiration", unit: { display: "/min" } },
	),
);

registerTransform(
	createVitalTransform(
		"OxygenSaturationVitalEvent",
		"OxygenSaturationVitalEvent",
		"oxygen_saturation",
		{ conceptId: "LOINC::2708-6", display: "Oxygen saturation" },
		{ magnitude: 98, unitAnchor: "o2", unit: { display: "%" } },
	),
);

registerTransform(
	createVitalTransform(
		"WeightVitalEvent",
		"WeightVitalEvent",
		"weight",
		{ conceptId: "LOINC::29463-7", display: "Weight" },
		{ magnitude: 70, unitAnchor: "mass", unit: { display: "kg" } },
	),
);

registerTransform(
	createVitalTransform(
		"HeightVitalEvent",
		"HeightVitalEvent",
		"height",
		{ conceptId: "LOINC::8302-2", display: "Height" },
		{ magnitude: 175, unitAnchor: "length", unit: { display: "cm" } },
	),
);
