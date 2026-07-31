import { describe, expect, it } from "bun:test";
import { ProseRenderer, TemplateWalker } from "../src/renderer/prose-renderer";
import type { SoapNote } from "../src/schemas/document";
import type { ClinicalProseTemplate } from "../src/store/interfaces";

describe("ProseRenderer", () => {
	const mockNote = {
		id: "note-123",
		title: "Mock Note",
		createdAt: { magnitude: 0 },
		updatedAt: { magnitude: 0 },
		status: "draft",
		patient: {
			id: "pat-456",
			name: { primaryOrSurname: "Doe", given: ["John"] },
			biologicalProfile: {
				id: "bio-1",
				gender: "female",
				age: 32,
			},
		},
		subjective: {
			presentingComplaint: {
				id: "pc-1",
				concept: { conceptId: "SNOMED::29857009", display: "Chest Pain" },
				rawTerm: "Chest Pain",
				sourceType: "patient_reported",
				certainty: "confirmed",
				severity: { score: 7, maxScore: 10, normalizedScore: 7 },
				duration: { magnitude: 3 },
				trajectory: "stable",
			},
			historyOfPresentIllness: {
				events: [
					{
						id: "obs-1",
						concept: { conceptId: "SNOMED::386661006", display: "Fever" },
						certainty: "confirmed",
					},
					{
						id: "obs-2",
						concept: { conceptId: "SNOMED::267036007", display: "Dyspnea" },
						certainty: "refuted",
					},
				],
			},
			patientHistories: {
				pastMedicalHistory: [],
				currentMedications: [],
				allergies: [],
			},
		},
		objective: {
			vitalSigns: [
				{
					id: "vit-1",
					vitalType: { conceptId: "LOINC::8867-4", display: "Heart Rate" },
					measurement: { magnitude: 82, unit: { display: "/min" } },
					rawTerm: "82",
				},
				{
					id: "vit-2",
					vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
					measurement: { magnitude: 38.5, unit: { display: "C" } },
					rawTerm: "38.5",
				},
			],
			physicalExamination: [],
		},
		assessment: {
			differentialDiagnoses: [],
		},
		plan: {
			prescriptions: [
				{
					id: "med-1",
					medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
					dosage: { magnitude: 500, unit: { display: "mg" } },
				},
			],
			investigations: [],
			referrals: [],
			interventions: [],
		},
	} as any as SoapNote;

	it("should interpolate simple paths directly", () => {
		const template: ClinicalProseTemplate = {
			templateId: "t-1",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Patient Doe is {gender}.",
			slots: {
				gender: {
					sourcePath: "patient.biologicalProfile.gender",
				},
			},
		};

		const output = ProseRenderer.renderTemplate(
			template,
			mockNote,
			[template],
			new Set(),
		);
		expect(output).toBe("Patient Doe is female.");
	});

	it("should apply format structures to arrays with custom joining delimiters", () => {
		const template: ClinicalProseTemplate = {
			templateId: "t-2",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Vitals: {vitals}.",
			slots: {
				vitals: {
					sourcePath: "objective.vitalSigns",
					listOptions: {
						delimiter: ", ",
						lastDelimiter: " and ",
					},
					format: "{vitalType.display}: {measurement.magnitude}",
				},
			},
		};

		const output = ProseRenderer.renderTemplate(
			template,
			mockNote,
			[template],
			new Set(),
		);
		expect(output).toBe("Vitals: Heart Rate: 82 and Temperature: 38.5.");
	});

	it("should recursively delegate rendering to sub-templates", () => {
		const rootTemplate: ClinicalProseTemplate = {
			templateId: "t-root",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "HPI: {hpi_details}",
			slots: {
				hpi_details: {
					sourcePath: "subjective.historyOfPresentIllness.events",
					defaultDelegateTemplateId: "t-child",
					listOptions: {
						delimiter: "; ",
					},
				},
			},
		};

		const childTemplate: ClinicalProseTemplate = {
			templateId: "t-child",
			targetSchema: "ObservationEvent",
			slotPosition: "opening",
			templateText: "{concept.display} ({certainty})",
			slots: {
				"concept.display": { sourcePath: "concept.display" },
				certainty: { sourcePath: "certainty" },
			},
		};

		const output = ProseRenderer.renderTemplate(
			rootTemplate,
			mockNote,
			[rootTemplate, childTemplate],
			new Set(),
		);
		expect(output).toBe("HPI: Fever (confirmed); Dyspnea (refuted)");
	});

	it("should conditionally route to correct child templates using pipeline conditions", () => {
		const rootTemplate: ClinicalProseTemplate = {
			templateId: "t-root",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Report: {report}",
			slots: {
				report: {
					sourcePath: "patient.biologicalProfile",
					conditionalDelegates: [
						{
							delegateTemplateId: "t-female",
							conditions: {
								pipeline: [
									{
										op: "eq",
										args: [{ $init: "gender" }, "female"],
									},
								],
							},
						},
						{
							delegateTemplateId: "t-male",
							conditions: {
								pipeline: [
									{
										op: "eq",
										args: [{ $init: "gender" }, "male"],
									},
								],
							},
						},
					],
					defaultDelegateTemplateId: "t-generic",
				},
			},
		};

		const femaleTemplate: ClinicalProseTemplate = {
			templateId: "t-female",
			targetSchema: "BiologicalProfile",
			slotPosition: "opening",
			templateText: "Female age {age}",
			slots: {
				age: { sourcePath: "age" },
			},
		};

		const output = ProseRenderer.renderTemplate(
			rootTemplate,
			mockNote,
			[rootTemplate, femaleTemplate],
			new Set(),
		);
		expect(output).toBe("Report: Female age 32");
	});

	it("should transform values using core translation pipeline steps", () => {
		const template: ClinicalProseTemplate = {
			templateId: "t-1",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Gender is {gender_upper}.",
			slots: {
				gender_upper: {
					sourcePath: "patient.biologicalProfile.gender",
					transform: {
						pipeline: [
							{
								op: "upper",
								args: [{ $init: "" }],
							},
						],
					},
				},
			},
		};

		const output = ProseRenderer.renderTemplate(
			template,
			mockNote,
			[template],
			new Set(),
		);
		expect(output).toBe("Gender is FEMALE.");
	});
});

describe("TemplateWalker", () => {
	it("should detect circular template references and throw", () => {
		const t1: ClinicalProseTemplate = {
			templateId: "t-1",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Loop {child}",
			slots: {
				child: {
					sourcePath: "patient",
					defaultDelegateTemplateId: "t-2",
				},
			},
		};

		const t2: ClinicalProseTemplate = {
			templateId: "t-2",
			targetSchema: "Patient",
			slotPosition: "opening",
			templateText: "Loop {child}",
			slots: {
				child: {
					sourcePath: "biologicalProfile",
					defaultDelegateTemplateId: "t-1",
				},
			},
		};

		expect(() => TemplateWalker.validateTemplateCycles([t1, t2])).toThrow();
	});

	it("should throw if nesting depth exceeds maximum depth", () => {
		const t1: ClinicalProseTemplate = {
			templateId: "t-1",
			targetSchema: "SoapNote",
			slotPosition: "opening",
			templateText: "Level 1 {child}",
			slots: {
				child: {
					sourcePath: "patient",
					defaultDelegateTemplateId: "t-2",
				},
			},
		};

		const t2: ClinicalProseTemplate = {
			templateId: "t-2",
			targetSchema: "Patient",
			slotPosition: "opening",
			templateText: "Level 2 {child}",
			slots: {
				child: {
					sourcePath: "biologicalProfile",
					defaultDelegateTemplateId: "t-3",
				},
			},
		};

		const t3: ClinicalProseTemplate = {
			templateId: "t-3",
			targetSchema: "BiologicalProfile",
			slotPosition: "opening",
			templateText: "Level 3",
			slots: {},
		};

		// maxDepth = 2: should throw because depth is 3
		expect(() =>
			TemplateWalker.validateTemplateDepth([t1, t2, t3], 2),
		).toThrow();

		// maxDepth = 4: should pass
		expect(() =>
			TemplateWalker.validateTemplateDepth([t1, t2, t3], 4),
		).not.toThrow();
	});
});
