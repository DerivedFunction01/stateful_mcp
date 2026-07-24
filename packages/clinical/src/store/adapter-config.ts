import type { ResourceLocator } from "@stateful-mcp/core";

export type ClinicalAdapterGroup =
	| "learning"
	| "dictionary"
	| "parser"
	| "soap_note"
	| "patient_store";

export interface ClinicalStorageAdapterConfig {
	group: ClinicalAdapterGroup;
	primary: ResourceLocator;
	fallbacks?: ResourceLocator[];
}

export type ClinicalStorageAdapterRegistry = Record<
	ClinicalAdapterGroup,
	ClinicalStorageAdapterConfig[]
>;

export const DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY: ClinicalStorageAdapterRegistry =
	{
		learning: [
			{
				group: "learning",
				primary: {
					_type: "adapter",
					name: "sqlite",
					options: {
						path: "./clinical-learning.sqlite",
					},
				},
				fallbacks: [
					{
						_type: "adapter",
						name: "memory",
						options: {
							seed: [],
						},
					},
				],
			},
			{
				group: "learning",
				primary: {
					_type: "adapter",
					name: "opfs-sqlite",
					options: {
						dbName: "clinical-learning-opfs.sqlite3",
					},
				},
			},
			{
				group: "learning",
				primary: {
					_type: "adapter",
					name: "jsonl",
					options: {
						path: "./clinical-learning.jsonl",
					},
				},
			},
			{
				group: "learning",
				primary: {
					_type: "adapter",
					name: "memory",
					options: {
						seed: [],
					},
				},
			},
		],
		dictionary: [],
		parser: [],
		soap_note: [],
		patient_store: [],
	};

export function getClinicalAdapterConfigs(
	group: ClinicalAdapterGroup,
	registry: ClinicalStorageAdapterRegistry = DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY,
): ClinicalStorageAdapterConfig[] {
	return registry[group] || [];
}
