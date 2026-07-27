import type {
	ClinicalStoreBackendConfig,
	ClinicalStoreDomain,
} from "./clinical-config";

export type ClinicalAdapterGroup = ClinicalStoreDomain;

export interface ClinicalStorageAdapterConfig
	extends ClinicalStoreBackendConfig {}

export type ClinicalStorageAdapterRegistry = {
	[K in ClinicalStoreDomain]: ClinicalStorageAdapterConfig[];
};

export type ClinicalDomainConfig = Record<
	ClinicalStoreDomain,
	ClinicalStoreDomainConfig
>;

import type { ClinicalStoreDomainConfig } from "./clinical-config";

export function getClinicalAdapterConfigs(
	group: ClinicalAdapterGroup,
	registry: ClinicalStorageAdapterRegistry,
): ClinicalStorageAdapterConfig[] {
	return registry[group] || [];
}
