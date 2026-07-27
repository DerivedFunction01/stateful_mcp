import { DEFAULT_CLINICAL_STORE_CONFIG } from "./clinical-config-seed";
import type { ClinicalStorageAdapterRegistry } from "../store/adapter-types";

export const DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY: ClinicalStorageAdapterRegistry =
	Object.fromEntries(
		Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(
			([key, value]) => [key, value.defaultAdapters],
		),
	) as ClinicalStorageAdapterRegistry;