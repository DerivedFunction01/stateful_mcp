import type { ClinicalInitConfig } from "../types";

/**
 * Defaults preserve the pre-init runtime behavior. Initialization is opt-in
 * until an explicit factory/orchestrator selects a source and policy.
 */
export const DEFAULT_CLINICAL_INIT_CONFIG: Readonly<
	Required<
		Pick<
			ClinicalInitConfig,
			| "enabled"
			| "mode"
			| "seedPolicy"
			| "validate"
			| "registerSchemas"
			| "seedSource"
		>
	>
> & { expansion: ClinicalInitConfig["expansion"] } = {
	enabled: false,
	mode: "bootstrap",
	seedPolicy: "never",
	validate: "none",
	registerSchemas: false,
	seedSource: "none",
	expansion: {
		enabled: false,
		lazy: true,
		sources: {},
	},
};

export function resolveClinicalInitConfig(
	config?: ClinicalInitConfig,
): ClinicalInitConfig {
	return {
		...DEFAULT_CLINICAL_INIT_CONFIG,
		...config,
		expansion: {
			...DEFAULT_CLINICAL_INIT_CONFIG.expansion,
			...config?.expansion,
		},
	};
}
