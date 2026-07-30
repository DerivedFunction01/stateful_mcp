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
	{ columns: ["medication.conceptId"], unique: false },
];

const medicationTemplate: ParsedItem = {
	targetSchema: "MedicationOrderObject",
	attributes: {},
	concept: [{ conceptId: "RxNorm::723", display: "Amoxicillin" }],
	rawText: "amoxicillin 500mg TID",
	tag: "MedicationOrderObject",
	extractedData: {
		medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
		route: "oral",
		frequency: { text: "TID", interval: { magnitude: 3.2, unit: "day" } },
		dosage: { text: "500mg", dose: 500.5, unit: "mg" },
		quantityToDispense: 30.5,
		authorizedRefills: 2.5,
		genericSubstitutionPermitted: true,
		targetIndication: {
			conceptId: "SNOMED::40275004",
			display: "Contact dermatitis",
		},
		rawTerm: "amoxicillin 500mg TID",
	},
};

const medicationColumnSpecs = (() => {
	const flat = flattenParsedItem(medicationTemplate);
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
	targetSchema: "MedicationOrderObject",
	template(): ParsedItem {
		return medicationTemplate;
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
	columnSpecs: medicationColumnSpecs,
};

registerTransform(transform);
