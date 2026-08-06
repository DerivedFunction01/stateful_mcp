import type { ClinicalProseTemplate } from "../../rendering/template-types";

export const exampleAssessmentTemplates: readonly ClinicalProseTemplate[] = [
	{
		templateId: "primary-diagnosis-root",
		templateName: "Primary Diagnosis Root",
		kind: "root",
		targetSchema: "PrimaryDiagnosis",
		section: "assessment",
		slotPosition: "full_paragraph",
		templateText:
			"Primary diagnosis: {diagnosis_display}{acuity_note}{supporting_list}{comorbidity_list}.",
		slots: {
			diagnosis_display: {
				sourcePath: "diagnosis.display",
			},
			acuity_note: {
				sourcePath: "acuityLevel",
				fallback: "",
			},
			supporting_list: {
				sourcePath: "supportingConcepts",
				defaultDelegateTemplateId: "primary-supporting-concept-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "PrimaryDiagnosis",
					slotKey: "primary_diagnosis.supportingConcepts",
				},
			},
			comorbidity_list: {
				sourcePath: "comorbidities",
				defaultDelegateTemplateId: "primary-comorbidity-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "PrimaryDiagnosis",
					slotKey: "primary_diagnosis.comorbidities",
				},
			},
		},
		active: true,
	},
	{
		templateId: "primary-supporting-concept-item",
		templateName: "Primary Supporting Concept Item",
		kind: "component",
		targetSchema: "PrimaryDiagnosis",
		slotPosition: "full_paragraph",
		templateText: "{concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
			},
		},
		active: true,
	},
	{
		templateId: "primary-comorbidity-item",
		templateName: "Primary Comorbidity Item",
		kind: "component",
		targetSchema: "PrimaryDiagnosis",
		slotPosition: "full_paragraph",
		templateText: "comorbid {concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
			},
		},
		active: true,
	},
	{
		templateId: "differential-diagnosis-root",
		templateName: "Differential Diagnosis Root",
		kind: "root",
		targetSchema: "DifferentialDiagnosis",
		section: "assessment",
		slotPosition: "full_paragraph",
		templateText:
			"#{rank} {diagnosis_display} ({confidence}){status_note}{supporting_list}{refuting_list}.",
		slots: {
			rank: {
				sourcePath: "rank",
				format: "number",
			},
			diagnosis_display: {
				sourcePath: "diagnosis.display",
			},
			confidence: {
				sourcePath: "confidence",
			},
			status_note: {
				sourcePath: "status",
				fallback: "",
			},
			supporting_list: {
				sourcePath: "supportingConcepts",
				defaultDelegateTemplateId: "differential-supporting-concept-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "DifferentialDiagnosis",
					slotKey: "differential_diagnosis.supportingConcepts",
				},
			},
			refuting_list: {
				sourcePath: "refutingConcepts",
				defaultDelegateTemplateId: "differential-refuting-concept-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "DifferentialDiagnosis",
					slotKey: "differential_diagnosis.refutingConcepts",
				},
			},
		},
		active: true,
	},
	{
		templateId: "differential-supporting-concept-item",
		templateName: "Differential Supporting Concept Item",
		kind: "component",
		targetSchema: "DifferentialDiagnosis",
		slotPosition: "full_paragraph",
		templateText: "supported by {concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
				fallback: "unknown concept",
			},
		},
		active: true,
	},
	{
		templateId: "differential-refuting-concept-item",
		templateName: "Differential Refuting Concept Item",
		kind: "component",
		targetSchema: "DifferentialDiagnosis",
		slotPosition: "full_paragraph",
		templateText: "refuted by {concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
				fallback: "unknown concept",
			},
		},
		active: true,
	},
	{
		templateId: "algorithmic-evaluation-root",
		templateName: "Algorithmic Evaluation Root",
		kind: "root",
		targetSchema: "AlgorithmicEvaluation",
		section: "assessment",
		slotPosition: "full_paragraph",
		templateText:
			"{algorithm_display} ({evaluation_type}){severity_note}: {hypotheses_list}.{override_note}",
		slots: {
			algorithm_display: {
				sourcePath: "algorithm.display",
			},
			evaluation_type: {
				sourcePath: "evaluationType",
			},
			severity_note: {
				sourcePath: "severityTier",
				fallback: "no severity tier",
			},
			hypotheses_list: {
				sourcePath: "hypothesesAndOutputs",
				defaultDelegateTemplateId: "algorithmic-hypothesis-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "AlgorithmicEvaluation",
					slotKey: "algorithmic_evaluation.hypothesesAndOutputs",
				},
			},
			override_note: {
				sourcePath: "overrideStatus",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "algorithmic-hypothesis-item",
		templateName: "Algorithmic Hypothesis Item",
		kind: "component",
		targetSchema: "AlgorithmicEvaluation",
		slotPosition: "full_paragraph",
		templateText: "{hypothesis_concept} ({category})",
		slots: {
			hypothesis_concept: {
				sourcePath: "concept.display",
				fallback: "unknown hypothesis",
			},
			category: {
				sourcePath: "category",
				fallback: "uncategorized",
			},
		},
		active: true,
	},
];
