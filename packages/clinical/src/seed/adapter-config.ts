/**
 * TEST/FIXTURE DEFAULTS ONLY — NOT FOR RUNTIME USE.
 *
 * ⚠️  This module is intentionally for prototype tests, mock fixtures, and
 *    local bootstrap data only. It is NOT the runtime source of truth.
 *
 * Production and long-lived clinical behavior MUST load from config-backed
 * stores/adapters instead of importing these values directly.
 *
 * For runtime usage:
 *   - Use `clinical-loader.ts` → `buildClinicalRuntime()` to resolve config
 *   - Use `CdslParser.create()` to resolve profiles from store, not seed arrays
 *
 * Existing direct imports are allowed only in test files and/or legacy
 * code paths that have not yet migrated to config-backed injection.
 */

import { DEFAULT_CLINICAL_STORE_CONFIG } from "./clinical-config-seed";
import type { ClinicalStorageAdapterRegistry } from "../store/adapter-types";

export const DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY: ClinicalStorageAdapterRegistry =
	Object.fromEntries(
		Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(
			([key, value]) => [key, value.defaultAdapters],
		),
	) as ClinicalStorageAdapterRegistry;