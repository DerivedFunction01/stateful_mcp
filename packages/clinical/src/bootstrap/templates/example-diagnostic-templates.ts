import type { ClinicalProseTemplate } from "../../rendering/template-types";

export const exampleDiagnosticTemplates: readonly ClinicalProseTemplate[] = [
	{
		templateId: "observation-root",
		templateName: "Observation Root",
		kind: "root",
		targetSchema: "Observation",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText:
			"{concept_display}{raw_term_note}{severity_note}{trajectory_note}{qualifier_list}.",
		slots: {
			concept_display: {
				sourcePath: "concept.display",
			},
			raw_term_note: {
				sourcePath: "rawTerm",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "str",
						},
						{
							op: "concat",
							args: [{ $literal: " (" }, { $var: "str" }, { $literal: ")" }],
						},
					],
				},
			},
			severity_note: {
				sourcePath: "severity.normalizedScore",
				format: "number",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "score",
						},
						{
							op: "concat",
							args: [{ $literal: " severity=" }, { $var: "score" }],
						},
					],
				},
			},
			trajectory_note: {
				sourcePath: "trajectory",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "traj",
						},
						{
							op: "concat",
							args: [{ $literal: " [" }, { $var: "traj" }, { $literal: "]" }],
						},
					],
				},
			},
			qualifier_list: {
				sourcePath: "qualifiers",
				defaultDelegateTemplateId: "observation-qualifier-item",
				listOptions: {
					delimiter: ", ",
					lastDelimiter: ", and ",
				},
				contract: {
					targetSchema: "Observation",
					slotKey: "observation.qualifiers",
				},
			},
		},
		active: true,
	},
	{
		templateId: "observation-qualifier-item",
		templateName: "Observation Qualifier Item",
		kind: "component",
		targetSchema: "Observation",
		slotPosition: "full_paragraph",
		templateText: "{qualifier_display}",
		slots: {
			qualifier_display: {
				sourcePath: "display",
				fallback: "unknown qualifier",
			},
		},
		active: true,
	},
	{
		templateId: "vitals-root",
		templateName: "Vitals Root",
		kind: "root",
		targetSchema: "Vitals",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText: "{vital_event_list}.",
		slots: {
			vital_event_list: {
				sourcePath: "vitalSigns",
				defaultDelegateTemplateId: "vital-event-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "Vitals",
					slotKey: "vitals.vitalSigns",
				},
			},
		},
		active: true,
	},
	{
		templateId: "vital-event-item",
		templateName: "Vital Event Item",
		kind: "component",
		targetSchema: "Vitals",
		slotPosition: "full_paragraph",
		templateText:
			"{vital_type}: {measurement_display}{bp_detail}{source_note}.",
		slots: {
			vital_type: {
				sourcePath: "vitalType.display",
				fallback: "vital",
			},
			measurement_display: {
				sourcePath: "measurement",
				conditionalDelegates: [
					{
						delegateTemplateId: "vital-bp-item",
						conditions: {
							pipeline: [
								{
									op: "eq",
									args: [
										{ $path: ["category"] },
										{ $literal: "blood_pressure" },
									],
								},
							],
						},
					},
				],
				defaultDelegateTemplateId: "vital-measurement-item",
				contract: {
					targetSchema: "Vitals",
					slotKey: "vitals.measurement",
				},
			},
			bp_detail: {
				sourcePath: "systolic",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "sys",
						},
						{
							op: "get",
							args: [{ $path: ["..", "diastolic"] }, { $literal: "magnitude" }],
							return_var: "dia",
						},
						{
							op: "to_string",
							args: [{ $var: "dia" }],
							return_var: "diaStr",
						},
						{
							op: "concat",
							args: [
								{ $literal: " (sys=" },
								{ $var: "sys" },
								{ $literal: "/dia=" },
								{ $var: "diaStr" },
								{ $literal: ")" },
							],
						},
					],
				},
			},
			source_note: {
				sourcePath: "sourceType",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "src",
						},
						{
							op: "concat",
							args: [{ $literal: " [" }, { $var: "src" }, { $literal: "]" }],
						},
					],
				},
			},
		},
		active: true,
	},
	{
		templateId: "vital-measurement-item",
		templateName: "Vital Measurement Item",
		kind: "component",
		targetSchema: "Vitals",
		slotPosition: "full_paragraph",
		templateText: "{magnitude} {unit_display}",
		slots: {
			magnitude: {
				sourcePath: "magnitude",
				format: "number",
			},
			unit_display: {
				sourcePath: "unit",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "vital-bp-item",
		templateName: "Blood Pressure Vital Item",
		kind: "component",
		targetSchema: "Vitals",
		slotPosition: "full_paragraph",
		templateText: "{systolic_mag}/{diastolic_mag} {unit_display}",
		slots: {
			systolic_mag: {
				sourcePath: "systolic.magnitude",
				format: "number",
			},
			diastolic_mag: {
				sourcePath: "diastolic.magnitude",
				format: "number",
			},
			unit_display: {
				sourcePath: "systolic.unit",
				fallback: "mmHg",
			},
		},
		active: true,
	},
	{
		templateId: "lab-panel-root",
		templateName: "Lab Panel Root",
		kind: "root",
		targetSchema: "LabPanel",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText:
			"{panel_name}{specimen_note}{result_time_note}: {analyte_list}.{panel_notes}",
		slots: {
			panel_name: {
				sourcePath: "panelName.display",
			},
			specimen_note: {
				sourcePath: "specimenType.display",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "spec",
						},
						{
							op: "concat",
							args: [{ $literal: " (" }, { $var: "spec" }, { $literal: ")" }],
						},
					],
				},
			},
			result_time_note: {
				sourcePath: "resultTime",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "rt",
						},
						{
							op: "concat",
							args: [{ $literal: " resulted " }, { $var: "rt" }],
						},
					],
				},
			},
			analyte_list: {
				sourcePath: "analytes",
				defaultDelegateTemplateId: "lab-analyte-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "LabPanel",
					slotKey: "lab_panel.analytes",
				},
			},
			panel_notes: {
				sourcePath: "notes",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "notes",
						},
						{
							op: "concat",
							args: [{ $literal: " Notes: " }, { $var: "notes" }],
						},
					],
				},
			},
		},
		active: true,
	},
	{
		templateId: "lab-analyte-item",
		templateName: "Lab Analyte Item",
		kind: "component",
		targetSchema: "LabPanel",
		slotPosition: "full_paragraph",
		templateText: "{analyte_name}: {measurement_display}{interpretation_note}",
		slots: {
			analyte_name: {
				sourcePath: "name.display",
				fallback: "unknown analyte",
			},
			measurement_display: {
				sourcePath: "measurements",
				defaultDelegateTemplateId: "lab-measurement-item",
				listOptions: {
					delimiter: ", ",
					lastDelimiter: ", and ",
				},
				contract: {
					targetSchema: "LabPanel",
					slotKey: "lab_panel.measurements",
				},
			},
			interpretation_note: {
				sourcePath: "interpretationFlag",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "flag",
						},
						{
							op: "concat",
							args: [{ $literal: " [" }, { $var: "flag" }, { $literal: "]" }],
						},
					],
				},
			},
		},
		active: true,
	},
	{
		templateId: "lab-measurement-item",
		templateName: "Lab Measurement Item",
		kind: "component",
		targetSchema: "LabPanel",
		slotPosition: "full_paragraph",
		templateText: "{value} {unit}",
		slots: {
			value: {
				sourcePath: "value",
				format: "number",
				fallback: "N/A",
			},
			unit: {
				sourcePath: "unit",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "device-diagnostic-root",
		templateName: "Device Diagnostic Root",
		kind: "root",
		targetSchema: "DeviceDiagnostic",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText:
			"{modality}{dicom_ref_note}: {interpretation_summary}{finding_list}{anatomy_note}.",
		slots: {
			modality: {
				sourcePath: "modality.display",
			},
			dicom_ref_note: {
				sourcePath: "dicomReference",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "ref",
						},
						{
							op: "concat",
							args: [{ $literal: " (" }, { $var: "ref" }, { $literal: ")" }],
						},
					],
				},
			},
			interpretation_summary: {
				sourcePath: "interpretation",
				fallback: "no interpretation provided",
			},
			finding_list: {
				sourcePath: "findings",
				defaultDelegateTemplateId: "device-finding-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "DeviceDiagnostic",
					slotKey: "device_diagnostic.findings",
				},
			},
			anatomy_note: {
				sourcePath: "anatomyLocations",
				fallback: "",
				transform: {
					pipeline: [
						{
							op: "to_string",
							args: [{ $path: [""] }],
							return_var: "anat",
						},
						{
							op: "concat",
							args: [{ $literal: " at " }, { $var: "anat" }],
						},
					],
				},
			},
		},
		active: true,
	},
	{
		templateId: "device-finding-item",
		templateName: "Device Finding Item",
		kind: "component",
		targetSchema: "DeviceDiagnostic",
		slotPosition: "full_paragraph",
		templateText: "{finding_display}",
		slots: {
			finding_display: {
				sourcePath: "display",
				fallback: "unknown finding",
			},
		},
		active: true,
	},
];
