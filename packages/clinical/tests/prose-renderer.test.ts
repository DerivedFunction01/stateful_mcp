import { describe, expect, it } from "bun:test";
import {
	type CellRenderResult,
	CellRenderWarning,
	ProseRenderer,
	TemplateWalker,
} from "../src/renderer/prose-renderer";
import type { Cell } from "../src/session/cell";
import type { ParsedItem } from "../src/parser/schema-parsers";
import type { SoapNote } from "../src/schemas/document";
import type { ClinicalProseTemplate } from "../src/store/interfaces";

// ── Cell Rendering Test Helpers ──────────────────────────────────────────────

function makeCell(overrides: Partial<Cell> = {}): Cell {
	return {
		cellId: "cell_1",
		sessionId: "session_1",
		mode: "cdsl",
		rawInput: "#vital temp 38.9 C",
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		context: { objects: {} },
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeParsedItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
	return {
		targetSchema: "VitalsMeasurementEvent",
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "#vital temp 38.9 C",
		tag: "#vital",
		extractedData: {
			measurement: { magnitude: 38.9, unit: { display: "C" } },
		},
		...overrides,
	};
}

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

// ── Cell Rendering Tests ──────────────────────────────────────────────────────

describe("ProseRenderer.renderCell", () => {
	const vitalsTemplate: ClinicalProseTemplate = {
		templateId: "tpl-vitals",
		targetSchema: "VitalsMeasurementEvent",
		slotPosition: "opening",
		templateText: "Temperature: {measurement.magnitude} {measurement.unit.display}",
		slots: {
			"measurement.magnitude": { sourcePath: "measurement.magnitude" },
			"measurement.unit.display": { sourcePath: "measurement.unit.display" },
		},
	};

	const vitalsConceptTemplate: ClinicalProseTemplate = {
		templateId: "tpl-vitals-concept",
		targetSchema: "VitalsMeasurementEvent",
		targetConceptId: "LOINC::8310-5",
		slotPosition: "opening",
		templateText: "Temp (concept): {measurement.magnitude}{measurement.unit.display}",
		slots: {
			"measurement.magnitude": { sourcePath: "measurement.magnitude" },
			"measurement.unit.display": { sourcePath: "measurement.unit.display" },
		},
	};

	const vitalsGenericTemplate: ClinicalProseTemplate = {
		templateId: "tpl-vitals-generic",
		targetSchema: "VitalsMeasurementEvent",
		slotPosition: "opening",
		templateText: "Vital: {measurement.magnitude}",
		slots: {
			"measurement.magnitude": { sourcePath: "measurement.magnitude" },
		},
	};

	const narrativeTemplate: ClinicalProseTemplate = {
		templateId: "tpl-narrative",
		targetSchema: "NarrativeCell",
		slotPosition: "opening",
		templateText: "Narrative: {rawInput}",
		slots: {
			rawInput: { sourcePath: "rawInput" },
		},
	};

	it("1. CDSL cell with one ParsedItem and matching schema template renders through TemplateRenderer", () => {
		const cell = makeCell({
			parsedOutput: [makeParsedItem()],
		});
		const result = ProseRenderer.renderCell(cell, [vitalsTemplate]);

		expect(result.text).toBe("Temperature: 38.9 C");
		expect(result.templateId).toBe("tpl-vitals");
		expect(result.targetSchema).toBe("VitalsMeasurementEvent");
		expect(result.warnings).toEqual([]);
	});

	it("2. CDSL cell with multiple parsed items renders each item independently and joins output deterministically", () => {
		const item1 = makeParsedItem({
			rawText: "#vital temp 38.9 C",
			extractedData: { measurement: { magnitude: 38.9, unit: { display: "C" } } },
		});
		const item2 = makeParsedItem({
			rawText: "#vital hr 82",
			concept: [{ conceptId: "LOINC::8867-4", display: "Heart Rate" }],
			extractedData: { measurement: { magnitude: 82, unit: { display: "/min" } } },
		});
		const cell = makeCell({
			parsedOutput: [item1, item2],
		});
		const result = ProseRenderer.renderCell(cell, [vitalsTemplate]);

		// Both items use the same template, joined by newline
		expect(result.text).toBe("Temperature: 38.9 C\nTemperature: 82 /min");
		expect(result.warnings).toEqual([]);
	});

	it("3. Explicit templateId overrides inferred template selection", () => {
		const cell = makeCell({
			parsedOutput: [makeParsedItem()],
		});
		const result = ProseRenderer.renderCell(cell, [vitalsTemplate, vitalsGenericTemplate], {
			templateId: "tpl-vitals-generic",
		});

		expect(result.text).toBe("Vital: 38.9");
		expect(result.templateId).toBe("tpl-vitals-generic");
	});

	it("4. Concept-specific template is preferred over generic schema template", () => {
		const cell = makeCell({
			parsedOutput: [makeParsedItem()],
		});
		const result = ProseRenderer.renderCell(cell, [
			vitalsGenericTemplate,
			vitalsConceptTemplate,
		]);

		// Should prefer the concept-specific template
		expect(result.templateId).toBe("tpl-vitals-concept");
		expect(result.text).toBe("Temp (concept): 38.9C");
	});

	it("5. Missing template returns raw input plus NO_MATCHING_TEMPLATE warning", () => {
		const cell = makeCell({
			parsedOutput: [makeParsedItem()],
		});
		const result = ProseRenderer.renderCell(cell, []);

		expect(result.text).toBe("#vital temp 38.9 C");
		expect(result.warnings).toContain(CellRenderWarning.NO_MATCHING_TEMPLATE);
	});

	it("6. Null/empty parsedOutput returns raw input fallback and NO_PARSED_OUTPUT warning", () => {
		const cell = makeCell({
			parsedOutput: null,
		});
		const result = ProseRenderer.renderCell(cell, [vitalsTemplate]);

		expect(result.text).toBe("#vital temp 38.9 C");
		expect(result.warnings).toContain(CellRenderWarning.NO_PARSED_OUTPUT);
	});

	it("7. Narrative cell returns rawInput and preserves narrativeTarget in metadata", () => {
		const cell = makeCell({
			mode: "narrative",
			rawInput: "Patient reports chest pain for 3 days",
			narrativeTarget: "subjective.historyOfPresentIllness.narrative",
		});
		const result = ProseRenderer.renderCell(cell, []);

		expect(result.text).toBe("Patient reports chest pain for 3 days");
		expect(result.targetField).toBe("subjective.historyOfPresentIllness.narrative");
		expect(result.warnings).toEqual([]);
	});

	it("8. Narrative cell with an explicit template renders through the existing template engine", () => {
		const cell = makeCell({
			mode: "narrative",
			rawInput: "Patient reports chest pain for 3 days",
			narrativeTarget: "subjective.historyOfPresentIllness.narrative",
		});
		const result = ProseRenderer.renderCell(cell, [narrativeTemplate], {
			templateId: "tpl-narrative",
		});

		expect(result.text).toBe("Narrative: Patient reports chest pain for 3 days");
		expect(result.templateId).toBe("tpl-narrative");
	});

	it("9. Rendering does not mutate the cell or its parsedOutput", () => {
		const originalItem = makeParsedItem();
		const cell = makeCell({
			parsedOutput: [originalItem],
		});
		// Deep clone before rendering to compare later
		const cellBefore = structuredClone(cell);

		ProseRenderer.renderCell(cell, [vitalsTemplate]);

		expect(cell).toEqual(cellBefore);
		expect(cell.parsedOutput).toEqual(cellBefore.parsedOutput);
		expect(cell.parsedOutput?.[0]?.extractedData).toEqual(
			cellBefore.parsedOutput?.[0]?.extractedData,
		);
	});

	it("10. Circular template dependency still throws the existing renderer error", () => {
		const t1: ClinicalProseTemplate = {
			templateId: "t-cycle-1",
			targetSchema: "VitalsMeasurementEvent",
			slotPosition: "opening",
			templateText: "Loop {child}",
			slots: {
				child: {
					sourcePath: "measurement",
					defaultDelegateTemplateId: "t-cycle-2",
				},
			},
		};

		const t2: ClinicalProseTemplate = {
			templateId: "t-cycle-2",
			targetSchema: "VitalsMeasurementEvent",
			slotPosition: "opening",
			templateText: "Loop {child}",
			slots: {
				child: {
					sourcePath: "magnitude",
					defaultDelegateTemplateId: "t-cycle-1",
				},
			},
		};

		const cell = makeCell({
			parsedOutput: [makeParsedItem()],
		});

		expect(() => ProseRenderer.renderCell(cell, [t1, t2])).toThrow();
	});

	it("11. Error/deleted cells do not render error text as clinical prose", () => {
		const errorCell = makeCell({
			status: "error",
			errorMessage: "parse failure",
			parsedOutput: [makeParsedItem()],
		});
		const errorResult = ProseRenderer.renderCell(errorCell, [vitalsTemplate]);
		expect(errorResult.text).toBe("");
		expect(errorResult.warnings[0]).toBe(CellRenderWarning.CELL_ERROR);

		const deletedCell = makeCell({
			status: "deleted",
			parsedOutput: [makeParsedItem()],
		});
		const deletedResult = ProseRenderer.renderCell(deletedCell, [vitalsTemplate]);
		expect(deletedResult.text).toBe("");
		expect(deletedResult.warnings).toContain(CellRenderWarning.CELL_DELETED);
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