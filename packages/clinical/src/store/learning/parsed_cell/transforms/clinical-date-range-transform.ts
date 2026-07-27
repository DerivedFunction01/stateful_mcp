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
	{ columns: ["direction"], unique: false },
];

const dateRangeTemplate: ParsedItem = {
	targetSchema: "ClinicalDateRange",
	attributes: {},
	concept: [],
	rawText: "past 2 weeks",
	tag: "ClinicalDateRange",
	extractedData: {
		direction: "past",
		lower: {
			bound: { isInclusive: true, precision: "day" },
			calendarDate: { year: 2024, month: 7, day: 13 },
		},
		upper: {
			bound: { isInclusive: true, precision: "day" },
			calendarDate: { year: 2024, month: 7, day: 27 },
		},
		time: {
			assertedTimestampUtc: "2024-07-27T00:00:00Z",
			precisionLevel: "day",
		},
	},
};

const dateRangeColumnSpecs = (() => {
	const flat = flattenParsedItem(dateRangeTemplate);
	delete flat.time;
	delete flat.includedDatetimes;
	delete flat.excludedDatetimes;
	return Object.entries(flat).map(([name, value]) => ({
		name,
		type: inferSqlType(value),
	}));
})();

const transform: ParsedCellRecordTransform = {
	targetSchema: "ClinicalDateRange",
	template(): ParsedItem {
		return dateRangeTemplate;
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);

		delete flat.time;
		delete flat.includedDatetimes;
		delete flat.excludedDatetimes;

		return flat;
	},
	indexes,
	columnSpecs: dateRangeColumnSpecs,
};

registerTransform(transform);
