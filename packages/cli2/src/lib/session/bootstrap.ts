import type { EngineBuilderResult } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import type { PatientProfile } from "@stateful-mcp/clinical/schemas/patient";
import { resolveInitialSession } from "./resolver";

/**
 * Placeholder patient used to seed a valid encounter on TUI bootstrap.
 * The TUI has no patient-entry flow yet; later patient onboarding can replace this.
 */
export const DEFAULT_TUI_PATIENT: PatientProfile = {
	id: "patient-tui",
	mrn: "MRN-TUI",
	name: { primaryOrSurname: "Test Patient" },
	administrativeGender: "undetermined",
	lifecycle: "active",
	biologicalProfile: { organismType: "human" },
} as any;

export interface BootstrapResult {
	result: EngineBuilderResult;
	sessionId: string;
}

/**
 * Bootstraps a TUI session: builds the engine, resolves the initial session id
 * through the sealed seam, and auto-inits the encounter once per session so the
 * workspace and cells work out-of-the-box on a fresh notebook.
 *
 * `ensureEncounter` is idempotent — safe on both fresh and resumed sessions.
 */
export async function bootstrapSession(
	options: { result?: EngineBuilderResult; patient?: PatientProfile } = {},
): Promise<BootstrapResult> {
	const result =
		options.result ??
		(await ClinicalEngineBuilder.withDefaultBackend("memory"));
	const sessionId = await resolveInitialSession(result.notebook);
	await result.engine.ensureEncounter(
		sessionId,
		options.patient ?? DEFAULT_TUI_PATIENT,
	);
	return { result, sessionId };
}
