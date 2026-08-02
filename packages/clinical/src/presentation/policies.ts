import type {
	PresentationFieldEmphasis,
	PresentationFieldKind,
} from "./field-types";

export interface PresentationFieldSpec {
	kind: PresentationFieldKind;
	label?: string;
	emphasis?: PresentationFieldEmphasis;
	visible?: boolean;
	fields?: Record<string, PresentationFieldSpec>;
	item?: PresentationFieldSpec;
}
export interface PresentationGroupPolicy {
	id: string;
	label: string;
	paths: string[];
}
export interface PresentationSchema {
	targetSchema: string;
	titlePath?: string;
	fields: Record<string, PresentationFieldSpec>;
	groups?: PresentationGroupPolicy[];
	hiddenPaths?: string[];
}

export const conceptField: PresentationFieldSpec = { kind: "concept" };
export const measurementField: PresentationFieldSpec = { kind: "measurement" };
export const durationField: PresentationFieldSpec = { kind: "duration" };
export const anatomyField: PresentationFieldSpec = { kind: "anatomy" };
export const statusField: PresentationFieldSpec = { kind: "status" };
export const textField: PresentationFieldSpec = { kind: "text" };
export const numberField: PresentationFieldSpec = { kind: "number" };
export const booleanField: PresentationFieldSpec = { kind: "boolean" };
export const arrayOf = (
	item: PresentationFieldSpec,
): PresentationFieldSpec => ({ kind: "collection", item });
export const objectOf = (
	fields: Record<string, PresentationFieldSpec>,
): PresentationFieldSpec => ({ kind: "object", fields });
const hidden = (): PresentationFieldSpec => ({ kind: "text", visible: false });

const policies: readonly PresentationSchema[] = [
	{
		targetSchema: "VitalsMeasurementEvent",
		titlePath: "vitalType.display",
		fields: {
			id: hidden(),
			vitalType: { ...conceptField, label: "Vital", emphasis: "primary" },
			category: textField,
			measurement: {
				...measurementField,
				label: "Measurement",
				emphasis: "primary",
			},
			rawTerm: hidden(),
		},
		groups: [
			{ id: "identity", label: "Identity", paths: ["vitalType", "category"] },
			{ id: "measurement", label: "Measurement", paths: ["measurement"] },
		],
	},
	{
		targetSchema: "BloodPressureVitalEvent",
		titlePath: "vitalType.display",
		fields: {
			id: hidden(),
			vitalType: { ...conceptField, label: "Vital", emphasis: "primary" },
			category: textField,
			systolic: { ...measurementField, label: "Systolic", emphasis: "primary" },
			diastolic: {
				...measurementField,
				label: "Diastolic",
				emphasis: "primary",
			},
			meanArterialPressure: measurementField,
			rawTerm: hidden(),
		},
		groups: [
			{ id: "identity", label: "Identity", paths: ["vitalType", "category"] },
			{ id: "systolic", label: "Systolic", paths: ["systolic"] },
			{ id: "diastolic", label: "Diastolic", paths: ["diastolic"] },
		],
	},
	{
		targetSchema: "ObservationEvent",
		titlePath: "concept.display",
		fields: {
			id: hidden(),
			concept: { ...conceptField, label: "Observation", emphasis: "primary" },
			rawTerm: hidden(),
			sourceType: textField,
			certainty: statusField,
			status: statusField,
			severity: {
				kind: "object",
				label: "Severity",
				emphasis: "diagnostic",
				fields: {
					score: numberField,
					maxScore: numberField,
					normalizedScore: numberField,
				},
			},
			duration: durationField,
			trajectory: textField,
			qualifiers: arrayOf(conceptField),
			anatomyLocations: arrayOf(anatomyField),
			dateRange: { kind: "range", label: "Date range" },
		},
		groups: [
			{
				id: "status",
				label: "Clinical status",
				paths: ["certainty", "status", "severity", "trajectory"],
			},
			{ id: "duration", label: "Duration", paths: ["duration"] },
			{
				id: "locations",
				label: "Locations",
				paths: ["anatomyLocations", "qualifiers"],
			},
		],
	},
	{
		targetSchema: "LabPanelResult",
		titlePath: "panelName.display",
		fields: {
			id: hidden(),
			panelName: { ...conceptField, label: "Panel", emphasis: "primary" },
			specimenType: conceptField,
			analytes: arrayOf(
				objectOf({
					name: { ...conceptField, label: "Analyte", emphasis: "primary" },
					value: measurementField,
					referenceRange: { kind: "range" },
					interpretationFlag: statusField,
					notes: textField,
				}),
			),
			rawTerm: hidden(),
		},
		groups: [
			{ id: "panel", label: "Panel", paths: ["panelName", "specimenType"] },
			{ id: "analytes", label: "Analytes", paths: ["analytes"] },
		],
	},
	{
		targetSchema: "MedicationOrderObject",
		titlePath: "medication.display",
		fields: {
			id: hidden(),
			medication: { ...conceptField, label: "Medication", emphasis: "primary" },
			dosage: measurementField,
			count: measurementField,
			frequency: objectOf({
				cadenceType: textField,
				interval: objectOf({ multiplier: numberField, unit: textField }),
				rate: objectOf({ times: numberField, period: textField }),
				isPrn: booleanField,
				prnReason: conceptField,
			}),
			route: textField,
			quantityToDispense: numberField,
			authorizedRefills: numberField,
			genericSubstitutionPermitted: booleanField,
			targetIndication: conceptField,
			rawTerm: hidden(),
		},
		groups: [
			{ id: "medication", label: "Medication", paths: ["medication"] },
			{
				id: "instructions",
				label: "Instructions",
				paths: [
					"dosage",
					"frequency",
					"route",
					"count",
					"quantityToDispense",
					"authorizedRefills",
				],
			},
		],
	},
	{
		targetSchema: "PrimaryDiagnosisEntry",
		titlePath: "diagnosis.display",
		fields: {
			id: hidden(),
			diagnosis: { ...conceptField, label: "Diagnosis", emphasis: "primary" },
			acuityLevel: statusField,
			supportingConcepts: arrayOf(conceptField),
			comorbidities: arrayOf(conceptField),
			anatomyLocations: arrayOf(anatomyField),
			relatedMedications: arrayOf(conceptField),
			rawTerm: hidden(),
		},
		groups: [
			{
				id: "diagnosis",
				label: "Diagnosis",
				paths: ["diagnosis", "acuityLevel"],
			},
			{ id: "locations", label: "Locations", paths: ["anatomyLocations"] },
		],
	},
];

const policyMap = new Map(
	policies.map((policy) => [policy.targetSchema, policy]),
);
export function getPresentationPolicy(
	targetSchema: string,
): PresentationSchema | undefined {
	return policyMap.get(targetSchema);
}
export function listPresentationPolicies(): readonly PresentationSchema[] {
	return policies;
}
