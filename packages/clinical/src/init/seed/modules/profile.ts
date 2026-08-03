import type { ClinicalInitSeedRecord } from "../record";
import { UNIT_DISPLAY_MAP } from "../../../v2/schemas/schemas-interface/measurement";

const defaultQuantityDisplay = {
	units: Object.fromEntries(
		Object.entries(UNIT_DISPLAY_MAP).map(([unit, display]) => [unit, { short: display }]),
	),
};

export const records: ClinicalInitSeedRecord[] = [
	{
		recordId: "starter.profile",
		kind: "profile",
		profileId: "starter.default",
		payload: {
			tagToken: "#",
			stateDelimiter: "||",
			quantityDisplay: defaultQuantityDisplay,
			languageValuesRequired: true,
			cellCommandToken: ":",
			cellCommandMappings: {
				up: "up", down: "down", go: "go", top: "top", bottom: "bottom",
				run: "run", preview: "preview", insert: "insert", delete: "delete",
				split: "split", mode: "mode", workspace: "workspace", set: "set",
				link: "link", unlink: "unlink", parent: "parent", help: "help",
				status: "status", save: "save", clear: "clear",
			},
			workspaceCommandMappings: {
				branch: "branch", rule_out: "rule_out", confirm: "confirm",
				suspend: "suspend", re_activate: "re_activate", elevate: "elevate",
				close: "close",
			},
			fieldMappings: {
				"ObservationEvent.symptom": "ObservationEvent.symptom",
				"ObservationEvent.severity": "ObservationEvent.severity",
				"VitalsMeasurementEvent.systolic": "VitalsMeasurementEvent.systolic",
				"VitalsMeasurementEvent.diastolic": "VitalsMeasurementEvent.diastolic",
				"PrimaryDiagnosisEntry.code": "PrimaryDiagnosisEntry.code",
				"MedicationOrderObject.drugName": "MedicationOrderObject.drugName",
			},
		},
	},
];
