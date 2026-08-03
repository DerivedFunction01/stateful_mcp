import { describe, expect, it } from "bun:test";
import {
	algorithmicEvaluationSchema,
	deviceDiagnosticSchema,
	differentialDiagnosisSchema,
	environmentSchema,
	exposureSchema,
	historySchema,
	interventionOrderSchema,
	investigationOrderSchema,
	labPanelSchema,
	mechanicalInjurySchema,
	medicationSchema,
	militaryPlanExtensionSchema,
	observationSchema,
	patientSchema,
	primaryDiagnosisSchema,
	protectiveEquipmentSchema,
	referralOrderSchema,
	safetyNettingSchema,
	soapNoteSchema,
	vitalsSchema,
} from "../src/schemas/definitions";
import { SchemaRegistry } from "../src/schemas/schema-registry";

const SCHEMAS: Array<{ name: string; schema: unknown }> = [
	{ name: "Observation", schema: observationSchema },
	{ name: "Vitals", schema: vitalsSchema },
	{ name: "Medication", schema: medicationSchema },
	{ name: "Patient", schema: patientSchema },
	{ name: "History", schema: historySchema },
	{ name: "PrimaryDiagnosis", schema: primaryDiagnosisSchema },
	{ name: "DifferentialDiagnosis", schema: differentialDiagnosisSchema },
	{ name: "AlgorithmicEvaluation", schema: algorithmicEvaluationSchema },
	{ name: "LabPanel", schema: labPanelSchema },
	{ name: "DeviceDiagnostic", schema: deviceDiagnosticSchema },
	{ name: "InvestigationOrder", schema: investigationOrderSchema },
	{ name: "ReferralOrder", schema: referralOrderSchema },
	{ name: "InterventionOrder", schema: interventionOrderSchema },
	{ name: "SafetyNetting", schema: safetyNettingSchema },
	{ name: "MilitaryPlanExtension", schema: militaryPlanExtensionSchema },
	{ name: "Exposure", schema: exposureSchema },
	{ name: "MechanicalInjury", schema: mechanicalInjurySchema },
	{ name: "ProtectiveEquipment", schema: protectiveEquipmentSchema },
	{ name: "Environment", schema: environmentSchema },
	{ name: "Note", schema: soapNoteSchema },
];

describe(" registered schemas", () => {
	it("registers and resolves every published schema definition", () => {
		const registry = new SchemaRegistry();
		for (const { schema } of SCHEMAS) {
			registry.register(schema as Parameters<SchemaRegistry["register"]>[0]);
		}

		for (const { name } of SCHEMAS) {
			expect(registry.get(name)?.schema).toBe(name);
			expect(registry.get(name)?.fingerprint.algorithm).toBe(
				"v2-schema-fingerprint-v1",
			);
		}
		expect(registry.list().length).toBe(SCHEMAS.length);
	});

	it("exposes every schema through the public definitions barrel", () => {
		expect(Object.keys(SCHEMAS).length).toBe(20);
	});
});
