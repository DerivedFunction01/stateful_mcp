import type { ColumnDef } from "@stateful-mcp/core";
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
