import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{
		recordId: "starter.profile",
		kind: "profile",
		profileId: "starter.default",
		payload: {
			tagToken: "#",
			stateDelimiter: "||",
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
