import type {
	EngineBuilderOptions,
	EngineBuilderResult,
} from "./clinical-engine-builder";
import { ClinicalEngineBuilder } from "./clinical-engine-builder";

export type EngineFactoryOptions = EngineBuilderOptions;
export type EngineFactoryResult = EngineBuilderResult;

/**
 * @deprecated Use `ClinicalEngineBuilder.withDefaultBackend("memory")` instead.
 * Kept for backward compatibility.
 */
export async function buildDefaultEngine(
	options?: EngineFactoryOptions,
): Promise<EngineFactoryResult> {
	return ClinicalEngineBuilder.withDefaultBackend("memory", {
		personnelId: options?.personnelId,
		profileId: options?.profileId,
	});
}

/**
 * @deprecated Use `ClinicalEngineBuilder.fromConfig()` instead.
 */
export async function buildClinicalEngine(
	runtime: any,
	options?: any,
): Promise<any> {
	const { ClinicalEngineBuilder } = await import("./clinical-engine-builder");
	throw new Error(
		"buildClinicalEngine() is removed. Use ClinicalEngineBuilder.fromConfig(config) directly.",
	);
}

/**
 * @deprecated Use `ClinicalEngineBuilder.fromConfig()` or `withDefaultBackend()` instead.
 */
export async function buildCellProcessor(
	engine: any,
	runtime: any,
): Promise<any> {
	throw new Error(
		"buildCellProcessor() is removed. CellProcessor is included in the builder result.",
	);
}
