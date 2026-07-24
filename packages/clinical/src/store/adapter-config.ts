import {
	DEFAULT_CLINICAL_STORE_CONFIG,
	type ClinicalStoreBackendConfig,
	type ClinicalStoreDomain,
} from "./clinical-config";

export type ClinicalAdapterGroup = ClinicalStoreDomain;

export interface ClinicalStorageAdapterConfig extends ClinicalStoreBackendConfig {}

export type ClinicalStorageAdapterRegistry = {
	[K in ClinicalStoreDomain]: ClinicalStorageAdapterConfig[];
};
export type ClinicalDomainConfig = typeof DEFAULT_CLINICAL_STORE_CONFIG.domains;

export const DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY: ClinicalStorageAdapterRegistry =
	Object.fromEntries(
		Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(([key, value]) => [
			key,
			value.defaultAdapters,
		]),
	) as ClinicalStorageAdapterRegistry;

export function getClinicalAdapterConfigs(
	group: ClinicalAdapterGroup,
	registry: ClinicalStorageAdapterRegistry = DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY,
): ClinicalStorageAdapterConfig[] {
	return registry[group] || [];
}

export { DEFAULT_CLINICAL_STORE_CONFIG };
