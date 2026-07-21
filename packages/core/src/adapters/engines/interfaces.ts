import type { QueryDefinition } from "../../middleware/filter/types";

export interface QueryEngine {
	execute(tableName: string, query: QueryDefinition): Promise<unknown[]>;
	// Optional — adapters that can compile to a human-readable form implement this.
	// Only returned to callers when expose_compiled: true in tool config.
	compile?(
		tableName: string,
		query: QueryDefinition,
	): { sql: string; params: unknown[] };
	// Capability declarations — checked at load time against translation op-families
	supportedOpFamilies?: string[];
	supportedOperations?: string[];
}
