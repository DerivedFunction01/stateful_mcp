import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../dict-backend";

export class MemoryConceptStoreBackend implements ConceptStoreBackend {
	async load(
		_concepts: Map<string, any>,
		_namespaces: Map<string, any>,
		_relations: any[],
	): Promise<void> {}

	async save(
		_concepts: Map<string, any>,
		_namespaces: Map<string, any>,
		_relations: any[],
	): Promise<void> {}
}

export class MemoryExpressionStoreBackend implements ExpressionStoreBackend {
	async load(_expressions: any[]): Promise<void> {}
	async save(_expressions: any[]): Promise<void> {}
}
