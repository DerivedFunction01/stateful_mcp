export interface ClinicalSchemaValidationResult {
	valid: boolean;
	diagnostics: string[];
}

export interface ClinicalSchemaAdapter {
	schemaName: string;
	schemaVersion: number;
	validateRecord(values: Record<string, unknown>): ClinicalSchemaValidationResult;
	normalizeRecord?(values: Record<string, unknown>): Record<string, unknown>;
	mergePolicy?: "record" | "append" | "replace" | "custom";
}

export class ClinicalSchemaAdapterRegistry {
	private readonly adapters = new Map<string, ClinicalSchemaAdapter>();

	register(adapter: ClinicalSchemaAdapter): void {
		const key = this.key(adapter.schemaName, adapter.schemaVersion);
		if (this.adapters.has(key)) throw new Error(`Clinical schema adapter '${key}' is already registered`);
		this.adapters.set(key, adapter);
	}

	get(schemaName: string, schemaVersion: number): ClinicalSchemaAdapter {
		const adapter = this.adapters.get(this.key(schemaName, schemaVersion));
		if (!adapter) throw new Error(`Clinical schema adapter '${schemaName}@${schemaVersion}' is not registered`);
		return adapter;
	}

	has(schemaName: string, schemaVersion: number): boolean {
		return this.adapters.has(this.key(schemaName, schemaVersion));
	}

	private key(schemaName: string, schemaVersion: number): string {
		return `${schemaName}@${schemaVersion}`;
	}
}
