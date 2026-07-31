import type { ClinicalStoreConfig } from "../store/clinical-config";
import { bootstrapClinicalStores } from "./bootstrap/bootstrap-writer";
import { resolveClinicalInitConfig } from "./config/defaults";
import { validateClinicalInitConfig } from "./config/validation";
import {
	loadClinicalInitSeedModules,
	resolveVariations,
	STARTER_CLINICAL_INIT_MANIFEST,
	validateClinicalInitSeedManifest,
	validateLoadedVariations,
} from "./seed/manifest";
import type { ClinicalInitSeedLoadedRecord } from "./seed/record";
import type { ClinicalInitDiagnostic, ClinicalInitReport } from "./types";
import { validateBootstrapReadiness } from "./validation/readiness";

export async function initializeClinicalRuntime(
	runtime: { config: ClinicalStoreConfig; parserStores: any },
	config: ClinicalStoreConfig,
): Promise<ClinicalInitReport> {
	const report: ClinicalInitReport = {
		source: "none",
		mode: config.init?.mode ?? "bootstrap",
		readiness: "not-checked",
		completedPhases: [],
		diagnostics: [],
	};

	// Phase 1: config
	const resolvedInit = resolveClinicalInitConfig(config.init);
	report.diagnostics.push(...validateClinicalInitConfig(config.init));
	const fatalDiagnostics = report.diagnostics.filter(
		(d: ClinicalInitDiagnostic) => d.severity === "error",
	);
	if (fatalDiagnostics.length > 0) {
		return report;
	}
	report.completedPhases.push("config");

	// Phase 2: storage (store backends are already resolved by the runtime)
	report.completedPhases.push("storage");

	// Phase 3: bootstrap
	if (resolvedInit.enabled && resolvedInit.seedSource !== "none") {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
		);
		report.diagnostics.push(
			...validateClinicalInitSeedManifest(STARTER_CLINICAL_INIT_MANIFEST),
		);
		report.diagnostics.push(...validateLoadedVariations(records));

		const variations = resolveVariations(records);
		const bootstrapRecords = records.filter(
			(r: ClinicalInitSeedLoadedRecord) => r.kind !== "variation_group",
		);

		const bootstrapResult = await bootstrapClinicalStores(
			runtime.parserStores,
			bootstrapRecords,
			{ seedPolicy: resolvedInit.seedPolicy },
		);
		report.diagnostics.push(...bootstrapResult.diagnostics);

		report.source =
			resolvedInit.seedSource === "external" ? "external" : "packaged-starter";
	}
	report.completedPhases.push("bootstrap");

	// Phase 4: expansion (if enabled)
	if (resolvedInit.expansion?.enabled) {
		report.completedPhases.push("expansion");
	}

	// Phase 5: validation (only when init is enabled)
	if (resolvedInit.enabled && resolvedInit.seedSource !== "none") {
		const readiness = await validateBootstrapReadiness(runtime.parserStores);
		report.readiness = readiness;
	}
	report.completedPhases.push("validation");

	return report;
}
