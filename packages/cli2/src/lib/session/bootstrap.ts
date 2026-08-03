import type { PatientProfile } from "@stateful-mcp/clinical/schemas/patient";
export { bootstrapV2Session } from "./bootstrap-v2";

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

export interface BootstrapResult { sessionId: string; }

/**
 * Bootstraps a TUI session: builds the engine, resolves the initial session id
 * through the sealed seam, and auto-inits the encounter once per session so the
 * workspace and cells work out-of-the-box on a fresh notebook.
 *
 * `ensureEncounter` is idempotent — safe on both fresh and resumed sessions.
 */
export async function bootstrapSession(
	options: { patient?: PatientProfile } = {},
): Promise<BootstrapResult> {
	void options;
	throw new Error(
		"cli2: V2 bootstrap is not wired yet; legacy ClinicalEngineBuilder bootstrap is disabled.",
	);
}
