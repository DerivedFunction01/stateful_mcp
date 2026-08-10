import type { MacroDefinition } from "../macros/macro-definition";

export const _PRIMARY_DIAGNOSIS_MACRO: MacroDefinition = {
	macroId: "v2-primary-diagnosis-1",
	macroName: "primary_diagnosis",
	version: 1,
	status: "published",
	active: true,
	root: {
		roleName: "primary_diagnosis",
		targetSchema: "PrimaryDiagnosis",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "id",
			name: "id",
			roleName: "primary_diagnosis.id",
			position: 0,
			target: { targetSchema: "PrimaryDiagnosis", targetPath: "id" },
			extraction: {
				kind: "scalar",
				required: true,
				patterns: ["(?<value>.+)"],
			},
			required: true,
		},
		{
			argumentId: "diagnosis",
			name: "diagnosis",
			roleName: "primary_diagnosis.diagnosis",
			position: 1,
			target: { targetSchema: "PrimaryDiagnosis", targetPath: "diagnosis" },
			extraction: {
				kind: "concept",
				required: true,
				patterns: ["(?<concept>.+)"],
			},
			required: true,
		},
	],
};

export const VITALS_MACRO: MacroDefinition = {
	macroId: "v2-vitals-1",
	macroName: "vitals",
	version: 1,
	status: "published",
	active: true,
	description: "Vital sign observations",
	root: {
		roleName: "vitals",
		targetSchema: "VitalSigns",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "heart_rate",
			name: "heart_rate",
			aliases: ["hr", "pulse"],
			roleName: "vitals.heart_rate",
			target: { targetSchema: "VitalSigns", targetPath: "heartRate" },
			extraction: {
				kind: "scalar",
				patterns: ["(?<value>\\d{1,3})"],
				numericBounds: { min: 20, max: 250, step: 1 },
			},
			forms: [
				{
					formId: "heart-rate-of",
					kind: "friendly",
					argumentId: "heart_rate",
					template: {
						version: 1,
						parts: [
							{ kind: "literal", text: "heart rate of " },
							{ kind: "slot", argumentId: "heart_rate", occurrence: 0 },
						],
					},
				},
			],
		},
		{
			argumentId: "blood_pressure",
			name: "blood_pressure",
			aliases: ["bp"],
			roleName: "vitals.blood_pressure",
			target: { targetSchema: "VitalSigns", targetPath: "bloodPressure" },
			extraction: {
				kind: "measurement",
				patterns: ["(?<systolic>\\d{1,3})\\/(?<diastolic>\\d{1,3})"],
			},
			forms: [
				{
					formId: "blood-pressure-of",
					kind: "friendly",
					argumentId: "blood_pressure",
					template: {
						version: 1,
						parts: [
							{ kind: "literal", text: "blood pressure of " },
							{ kind: "slot", argumentId: "blood_pressure", occurrence: 0 },
						],
					},
				},
			],
		},
		{
			argumentId: "respiration",
			name: "respiration",
			aliases: ["rr"],
			roleName: "vitals.respiration",
			target: { targetSchema: "VitalSigns", targetPath: "respiration" },
			extraction: {
				kind: "scalar",
				patterns: ["(?<value>\\d{1,2})"],
				numericBounds: { min: 6, max: 60, step: 1 },
			},
		},
	],
};

export const ASSESSMENT_MACRO: MacroDefinition = {
	macroId: "v2-assessment-1",
	macroName: "assessment",
	version: 1,
	status: "published",
	active: true,
	description: "Subjective assessment with severity",
	root: {
		roleName: "assessment",
		targetSchema: "Assessment",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "severity",
			name: "severity",
			roleName: "assessment.severity",
			position: 0,
			target: { targetSchema: "Assessment", targetPath: "severity" },
			extraction: {
				kind: "scalar",
				patterns: ["(?<value>\\d{1,2})"],
				numericBounds: { min: 0, max: 10, step: 1 },
			},
			forms: [
				{
					formId: "severity-of",
					kind: "friendly",
					argumentId: "severity",
					template: {
						version: 1,
						parts: [
							{ kind: "literal", text: "severity of " },
							{ kind: "slot", argumentId: "severity", occurrence: 0 },
						],
					},
				},
			],
		},
		{
			argumentId: "concept",
			name: "concept",
			roleName: "assessment.concept",
			position: 1,
			target: { targetSchema: "Assessment", targetPath: "concept" },
			extraction: {
				kind: "concept",
				patterns: ["(?<concept>[A-Za-z ]+)"],
			},
			autocomplete: { source: "dictionary" },
			forms: [
				{
					formId: "concept-at-severity",
					kind: "friendly",
					argumentId: "concept",
					compatibility: ["severity-of"],
					template: {
						version: 1,
						parts: [
							{ kind: "slot", argumentId: "concept", occurrence: 0 },
							{ kind: "literal", text: " at severity " },
							{ kind: "slot", argumentId: "severity", occurrence: 0 },
						],
					},
				},
			],
		},
	],
};

export const PHYSICAL_EXAM_MACRO: MacroDefinition = {
	macroId: "v2-physical-exam-1",
	macroName: "physical_exam",
	version: 1,
	status: "published",
	active: true,
	description: "Physical exam measurements",
	root: {
		roleName: "physical_exam",
		targetSchema: "PhysicalExam",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "weight",
			name: "weight",
			roleName: "physical_exam.weight",
			target: { targetSchema: "PhysicalExam", targetPath: "weight" },
			extraction: {
				kind: "measurement",
				patterns: ["(?<weight>\\d+(?:\\.\\d+)?) kg"],
			},
			forms: [
				{
					formId: "weight-height",
					kind: "friendly",
					argumentId: "weight",
					template: {
						version: 1,
						parts: [
							{ kind: "literal", text: "weight of " },
							{ kind: "slot", argumentId: "weight", occurrence: 0 },
							{ kind: "literal", text: " and height of " },
							{ kind: "slot", argumentId: "height", occurrence: 0 },
						],
					},
				},
			],
		},
		{
			argumentId: "height",
			name: "height",
			roleName: "physical_exam.height",
			target: { targetSchema: "PhysicalExam", targetPath: "height" },
			extraction: {
				kind: "measurement",
				patterns: ["(?<height>\\d+(?:\\.\\d+)?) m"],
			},
		},
	],
};

export const NOTE_MACRO: MacroDefinition = {
	macroId: "v2-note-1",
	macroName: "note",
	version: 1,
	status: "published",
	active: true,
	description: "A note with a title, page number, and year",
	root: {
		roleName: "note",
		targetSchema: "Note",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "title",
			name: "title",
			roleName: "note.title",
			position: 0,
			target: { targetSchema: "Note", targetPath: "title" },
			extraction: {
				kind: "concept",
				patterns: ["(?<title>[A-Za-z][A-Za-z ]*)"],
				required: true,
			},
			required: true,
			autocomplete: { source: "dictionary" },
		},
		{
			argumentId: "page_num",
			name: "page_num",
			roleName: "note.page_num",
			position: 1,
			target: { targetSchema: "Note", targetPath: "pageNum" },
			extraction: {
				kind: "scalar",
				patterns: ["(?<page_num>\\d{1,4})"],
				numericBounds: { min: 1, max: 5000, step: 1 },
				required: false,
			},
		},
		{
			argumentId: "year",
			name: "year",
			roleName: "note.year",
			position: 2,
			target: { targetSchema: "Note", targetPath: "year" },
			extraction: {
				kind: "scalar",
				patterns: ["(?<year>\\d{4})"],
				numericBounds: { min: 1, max: 9999, step: 1 },
				required: false,
			},
		},
	],
	authoringTemplates: [
		{
			version: 1,
			templateId: "note-favorite-book",
			parts: [
				{ kind: "literal", text: "My favorite book is " },
				{
					kind: "slot",
					argumentId: "title",
					occurrence: 0,
					displayText: "title",
				},
				{ kind: "literal", text: " when I read it in the year " },
				{
					kind: "slot",
					argumentId: "year",
					occurrence: 0,
					displayText: "year",
				},
				{ kind: "literal", text: " and I got to page " },
				{
					kind: "slot",
					argumentId: "page_num",
					occurrence: 0,
					displayText: "page",
				},
				{ kind: "literal", text: "." },
			],
		},
		{
			version: 1,
			parts: [
				{ kind: "literal", text: "has page # " },
				{ kind: "slot", argumentId: "page_num", occurrence: 0 },
			],
		},
		{
			version: 1,
			templateId: "note-has-a-page",
			parts: [
				{ kind: "literal", text: "has a page # " },
				{
					kind: "slot",
					argumentId: "page_num",
					occurrence: 0,
					displayText: "page",
				},
			],
		},
		{
			version: 1,
			parts: [
				{ kind: "literal", text: "during " },
				{ kind: "slot", argumentId: "year", occurrence: 0 },
			],
		},
	],
};

export const DIFFERENTIAL_ACTIVE_MACRO: MacroDefinition = {
	macroId: "v2-differential-active-1",
	macroName: "differential_active",
	version: 1,
	status: "published",
	active: true,
	description: "Active differential hypothesis creation & evidence linking",
	root: {
		roleName: "differential_active",
		targetSchema: "DifferentialDiagnosis",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "diagnosis",
			name: "diagnosis",
			roleName: "differential.diagnosis",
			position: 0,
			target: {
				targetSchema: "DifferentialDiagnosis",
				targetPath: "diagnosis",
			},
			extraction: { kind: "concept", required: true },
			required: true,
		},
		{
			argumentId: "supportingConcepts",
			name: "supportingConcepts",
			roleName: "differential.supportingConcepts",
			position: 1,
			target: {
				targetSchema: "DifferentialDiagnosis",
				targetPath: "supportingConcepts",
			},
			extraction: { kind: "concept_array", required: false },
		},
		{
			argumentId: "refutingConcepts",
			name: "refutingConcepts",
			roleName: "differential.refutingConcepts",
			position: 2,
			target: {
				targetSchema: "DifferentialDiagnosis",
				targetPath: "refutingConcepts",
			},
			extraction: { kind: "concept_array", required: false },
		},
	],
};

export const DIFFERENTIAL_RULE_OUT_MACRO: MacroDefinition = {
	...DIFFERENTIAL_ACTIVE_MACRO,
	macroId: "v2-differential-rule-out-1",
	macroName: "differential_rule_out",
	description: "Rule out differential hypothesis action macro",
};

export const DIFFERENTIAL_CONFIRM_MACRO: MacroDefinition = {
	...DIFFERENTIAL_ACTIVE_MACRO,
	macroId: "v2-differential-confirm-1",
	macroName: "differential_confirm",
	description: "Confirm differential hypothesis action macro",
};

export const DIFFERENTIAL_SUSPEND_MACRO: MacroDefinition = {
	...DIFFERENTIAL_ACTIVE_MACRO,
	macroId: "v2-differential-suspend-1",
	macroName: "differential_suspend",
	description: "Suspend differential hypothesis action macro",
};

export const DIFFERENTIAL_CLOSE_MACRO: MacroDefinition = {
	...DIFFERENTIAL_ACTIVE_MACRO,
	macroId: "v2-differential-close-1",
	macroName: "differential_close",
	description: "Close differential hypothesis action macro",
};

export const DEFAULT_MACROS: MacroDefinition[] = [
	_PRIMARY_DIAGNOSIS_MACRO,
	VITALS_MACRO,
	ASSESSMENT_MACRO,
	PHYSICAL_EXAM_MACRO,
	NOTE_MACRO,
	DIFFERENTIAL_ACTIVE_MACRO,
	DIFFERENTIAL_RULE_OUT_MACRO,
	DIFFERENTIAL_CONFIRM_MACRO,
	DIFFERENTIAL_SUSPEND_MACRO,
	DIFFERENTIAL_CLOSE_MACRO,
];

export async function seedDefaultMacros(store: {
	set(macro: MacroDefinition): Promise<void>;
}): Promise<void> {
	for (const macro of DEFAULT_MACROS) {
		await store.set(macro);
	}
}
