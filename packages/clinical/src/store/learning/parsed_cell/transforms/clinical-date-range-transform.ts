import type { ParsedItem } from "../../../../parser/schema-parsers.v2";
import {
	type ParsedCellRecordTransform,
	registerTransform,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

const transform: ParsedCellRecordTransform = {
	targetSchema: "ClinicalDateRange",
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);

		delete flat.time;
		delete flat.includedDatetimes;
		delete flat.excludedDatetimes;

		return flat;
	},
};

registerTransform(transform);
