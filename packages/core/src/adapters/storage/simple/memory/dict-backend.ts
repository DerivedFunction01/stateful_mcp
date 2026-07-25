import type {
	ConceptStoreBackend,
	DictDelta,
	ExpressionStoreBackend,
} from "../dict-backend";

export class MemoryConceptStoreBackend implements ConceptStoreBackend {
	private cacheConcepts = new Map<string, any>();
	private cacheNamespaces = new Map<string, any>();
	private cacheRelations: any[] = [];

	async load(
		concepts: Map<string, any>,
		namespaces: Map<string, any>,
		relations: any[],
	): Promise<void> {
		concepts.clear();
		namespaces.clear();
		relations.length = 0;

		for (const [id, c] of this.cacheConcepts.entries()) {
			concepts.set(id, c);
		}
		for (const [code, ns] of this.cacheNamespaces.entries()) {
			namespaces.set(code, ns);
		}
		for (const r of this.cacheRelations) {
			relations.push(r);
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		for (const delta of deltas) {
			if (delta.kind === "concept") {
				if (delta.op === "set" && delta.data) {
					this.cacheConcepts.set(delta.id, delta.data);
				} else {
					this.cacheConcepts.delete(delta.id);
				}
			} else if (delta.kind === "namespace") {
				if (delta.op === "set" && delta.data) {
					this.cacheNamespaces.set(delta.id, delta.data);
				} else {
					this.cacheNamespaces.delete(delta.id);
				}
			} else if (delta.kind === "relation") {
				if (delta.op === "set" && delta.data) {
					const idx = this.cacheRelations.findIndex(
						(r: any) => r.id === delta.id,
					);
					if (idx !== -1) {
						this.cacheRelations[idx] = delta.data;
					} else {
						this.cacheRelations.push(delta.data);
					}
				} else {
					this.cacheRelations = this.cacheRelations.filter(
						(r: any) => r.id !== delta.id,
					);
				}
			}
		}
	}
}

export class MemoryExpressionStoreBackend implements ExpressionStoreBackend {
	private cacheExpressions: any[] = [];

	async load(expressions: any[]): Promise<void> {
		expressions.length = 0;
		for (const e of this.cacheExpressions) {
			expressions.push(e);
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		for (const delta of deltas) {
			if (delta.kind !== "expression") continue;
			if (delta.op === "set" && delta.data) {
				const idx = this.cacheExpressions.findIndex(
					(e: any) => e.id === delta.id,
				);
				if (idx !== -1) {
					this.cacheExpressions[idx] = delta.data;
				} else {
					this.cacheExpressions.push(delta.data);
				}
			} else {
				this.cacheExpressions = this.cacheExpressions.filter(
					(e: any) => e.id !== delta.id,
				);
			}
		}
	}
}
