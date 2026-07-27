import type { ParsedItem } from "../../../../parser/schema-parsers.v2";
import {
	type ParsedCellRecordTransform,
	registerTransform,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

const transform: ParsedCellRecordTransform = {
	targetSchema: "MedicationOrderObject",
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);

		delete flat.id;
		delete flat.soapSection;
		delete flat.rawTerm;
		delete flat.dateRange;

		return flat;
	},
};

registerTransform(transform);
