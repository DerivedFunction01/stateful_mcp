import type { V2MacroDefinition } from "./macro-definition";

export const V2_PRIMARY_DIAGNOSIS_MACRO: V2MacroDefinition = {
	macroId: "v2-primary-diagnosis-1",
	macroName: "primary_diagnosis",
	version: 1,
	status: "published",
	active: true,
	root: { roleName: "primary_diagnosis", targetSchema: "PrimaryDiagnosis", outputCellKind: "structured" },
	arguments: [
		{ argumentId: "id", name: "id", roleName: "primary_diagnosis.id", position: 0, target: { targetSchema: "PrimaryDiagnosis", targetPath: "id" }, extraction: { kind: "scalar", required: true, patterns: ["(?<value>.+)"] }, required: true },
		{ argumentId: "diagnosis", name: "diagnosis", roleName: "primary_diagnosis.diagnosis", position: 1, target: { targetSchema: "PrimaryDiagnosis", targetPath: "diagnosis" }, extraction: { kind: "concept", required: true, patterns: ["(?<concept>.+)"] }, required: true },
	],
};

export async function seedDefaultV2Macros(store: { set(macro: V2MacroDefinition): Promise<void> }): Promise<void> {
	await store.set(V2_PRIMARY_DIAGNOSIS_MACRO);
}
