import {
	type ClinicalInitConfig,
	ClinicalInitConfigDiagnosticCode,
	type ClinicalInitDiagnostic,
} from "../types";
import { resolveClinicalInitConfig } from "./defaults";

export function validateClinicalInitConfig(
	config?: ClinicalInitConfig,
): ClinicalInitDiagnostic[] {
	const resolved = resolveClinicalInitConfig(config);
	const diagnostics: ClinicalInitDiagnostic[] = [];

	if (!resolved.enabled && resolved.seedSource !== "none") {
		diagnostics.push({
			severity: "warning",
			code: ClinicalInitConfigDiagnosticCode.INIT_DISABLED_WITH_SOURCE,
			message:
				"Initialization is disabled, so the selected seed source will not be used.",
			phase: "config",
		});
	}

	if (resolved.seedPolicy === "force" && resolved.seedSource === "none") {
		diagnostics.push({
			severity: "error",
			code: ClinicalInitConfigDiagnosticCode.FORCE_SEED_WITHOUT_SOURCE,
			message:
				"A force seed policy requires an external or starter seed source.",
			phase: "config",
		});
	}

	if (resolved.expansion?.enabled && resolved.mode !== "full") {
		diagnostics.push({
			severity: "warning",
			code: ClinicalInitConfigDiagnosticCode.EXPANSION_WITH_BOOTSTRAP_MODE,
			message:
				"Expansion data is enabled while initialization mode is bootstrap.",
			phase: "config",
		});
	}

	return diagnostics;
}
