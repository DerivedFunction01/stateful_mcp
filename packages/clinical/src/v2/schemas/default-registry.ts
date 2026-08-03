import {
	algorithmicEvaluationSchema,
	differentialDiagnosisSchema,
	deviceDiagnosticSchema,
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
} from "./definitions";
import { SchemaRegistry } from "./schema-registry";

/** Creates the published V2 schema catalog used by the CLI/runtime bootstrap. */
export function createDefaultV2SchemaRegistry(): SchemaRegistry {
	const registry = new SchemaRegistry();
	for (const definition of [
		algorithmicEvaluationSchema,
		differentialDiagnosisSchema,
		deviceDiagnosticSchema,
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
	]) registry.register(definition);
	return registry;
}
