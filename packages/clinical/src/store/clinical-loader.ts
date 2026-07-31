/**
 * Clinical config loader — mirrors the core loader pattern but returns
 * clinical runtime pieces instead of middleware config.
 *
 * Reuses core's `resolveConfigDir()`, `readJsonConfigFile<T>()`,
 * `loadJsonConfigCandidates<T>()`, `resolveSource()`, and `resolveAdapter()`.
 */

import {
	loadJsonConfigCandidates,
	readJsonConfigFile,
	resolveConfigDir,
} from "@stateful-mcp/core";
import * as path from "path";
import { initializeClinicalRuntime } from "../init/orchestrator";
import type { ClinicalStoreConfig } from "./clinical-config";
import type { ClinicalRuntime } from "./clinical-runtime";
import { createClinicalRuntime } from "./clinical-runtime";

/**
 * Loads a ClinicalStoreConfig from a config directory.
 *
 * Search order:
 *   1. `config/clinical.config.json` under the given directory
 *   2. `clinical.config.json` in the given directory
 *   3. Falls back to the default config (in-memory, no file I/O)
 */
export async function loadClinicalStoreConfig(
	dir?: string,
): Promise<ClinicalStoreConfig> {
	const resolvedRoot = dir ?? resolveConfigDir();

	const candidates = [
		{
			path: path.join(resolvedRoot, "config", "clinical.config.json"),
			optional: true,
		},
		{ path: path.join(resolvedRoot, "clinical.config.json"), optional: true },
	];

	const loaded =
		await loadJsonConfigCandidates<ClinicalStoreConfig>(candidates);
	if (loaded) return loaded;

	// Fall back to default in-memory config
	const { DEFAULT_CLINICAL_STORE_CONFIG } = await import(
		"../seed/clinical-config-seed"
	);
	return DEFAULT_CLINICAL_STORE_CONFIG;
}

/**
 * Loads a ClinicalStoreConfig from a specific file path.
 */
export async function loadClinicalStoreConfigFromFile(
	filePath: string,
): Promise<ClinicalStoreConfig> {
	return readJsonConfigFile<ClinicalStoreConfig>(filePath);
}

/**
 * One-shot factory: loads config (from dir or default) and returns a fully
 * wired ClinicalRuntime. If the config has init enabled, runs initialization
 * before returning the runtime.
 */
export async function buildClinicalRuntime(
	dir?: string,
): Promise<ClinicalRuntime> {
	const config = await loadClinicalStoreConfig(dir);
	const runtime = await createClinicalRuntime(config);
	if (config.init?.enabled) {
		await initializeClinicalRuntime(runtime, config);
	}
	return runtime;
}

/**
 * Factory that accepts a config object directly (no file I/O).
 * Useful for tests and programmatic usage.
 * If the config has init enabled, runs initialization before returning the runtime.
 */
export async function buildClinicalRuntimeFromConfig(
	config: ClinicalStoreConfig,
): Promise<ClinicalRuntime> {
	const runtime = await createClinicalRuntime(config);
	if (config.init?.enabled) {
		await initializeClinicalRuntime(runtime, config);
	}
	return runtime;
}
