import type { ClinicalProseTemplate } from "../../rendering/template-types";

export const EXAMPLE_CORE_TEMPLATES: readonly ClinicalProseTemplate[] = [
	{
		templateId: "soap-note-root",
		templateName: "SOAP Note Root Assembly",
		kind: "root",
		targetSchema: "soap_note",
		slotPosition: "full_paragraph",
		templateText:
			"Subjective:\n{patient}\n\nHistory:\n{history}\n\nObjective:\n{environment}\n\nAssessment and Plan:\n{exposure}",
		slots: {
			patient: {
				sourcePath: "patient",
				defaultDelegateTemplateId: "soap-note-patient",
			},
			history: {
				sourcePath: "history",
				defaultDelegateTemplateId: "soap-note-history",
			},
			environment: {
				sourcePath: "environment",
				defaultDelegateTemplateId: "soap-note-environment",
			},
			exposure: {
				sourcePath: "exposure",
				defaultDelegateTemplateId: "soap-note-exposure",
			},
		},
		active: true,
	},
	{
		templateId: "soap-note-patient",
		templateName: "SOAP Note Patient Component",
		kind: "component",
		targetSchema: "patient",
		section: "subjective",
		slotPosition: "full_paragraph",
		templateText: "Patient: {name}",
		slots: {
			name: {
				sourcePath: "name",
			},
		},
		active: true,
	},
	{
		templateId: "soap-note-history",
		templateName: "SOAP Note History Component",
		kind: "component",
		targetSchema: "history",
		section: "subjective",
		slotPosition: "full_paragraph",
		templateText: "History: {summary}",
		slots: {
			summary: {
				sourcePath: "summary",
			},
		},
		active: true,
	},
	{
		templateId: "soap-note-environment",
		templateName: "SOAP Note Environment Component",
		kind: "component",
		targetSchema: "environment",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText: "Environment: {location}",
		slots: {
			location: {
				sourcePath: "location",
			},
		},
		active: true,
	},
	{
		templateId: "soap-note-exposure",
		templateName: "SOAP Note Exposure Component",
		kind: "component",
		targetSchema: "exposure",
		section: "subjective",
		slotPosition: "full_paragraph",
		templateText: "Exposure: {agent}",
		slots: {
			agent: {
				sourcePath: "agent",
			},
		},
		active: true,
	},
];
