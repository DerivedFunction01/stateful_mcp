import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine";
import type { PatientProfile } from "@stateful-mcp/clinical/schemas/patient";
import { printJson } from "../formatter/format-parsed";

export async function handleSession(
	engine: ClinicalEngine,
	args: string[],
): Promise<void> {
	const sub = args[0];

	if (sub === "create") {
		const patientName = args.slice(1).join(" ") || "Test Patient";
		const sessionId = `session-${Date.now()}`;
		const patient: PatientProfile = {
			id: `patient-${Date.now()}`,
			name: { primaryOrSurname: patientName },
		} as any;
		await engine.initEncounter(sessionId, patient);
		printJson({ sessionId, patient: patientName });
		return;
	}

	console.error("usage: clinical session create [patient name]");
	process.exit(1);
}
