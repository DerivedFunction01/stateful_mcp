import type { ParsedItem } from "../../../../parser/schema-parsers";
import {
	type ParsedCellRecordTransform,
	registerTransform,
	type TransformIndexSpec,
} from "../parsed-cell-record-transform";
import { flattenParsedItem } from "./flatten-helper";

const indexes: TransformIndexSpec[] = [
	{ columns: ["recencyScore"], unique: false },
	{ columns: ["conceptId"], unique: false },
];

const transform: ParsedCellRecordTransform = {
	targetSchema: "ObservationEvent",
	template(): ParsedItem {
		return {
			targetSchema: "ObservationEvent",
			attributes: {},
			concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			rawText: "temperature 101F",
			tag: "ObservationEvent",
			extractedData: {
				certainty: "confirmed",
				status: "present",
				severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
				duration: {
					magnitude: 2,
					unit: "days",
					operator: "eq",
					is_approximate: false,
				},
				trajectory: "worsening",
				qualifiers: [{ conceptId: "SNOMED::246072003", display: "Fever" }],
			},
		};
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as ParsedItem);

		delete flat.id;
		delete flat.rawTerm;
		delete flat.dateRange;

		return flat;
	},
	indexes,
};

registerTransform(transform);
