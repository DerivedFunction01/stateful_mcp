import type {
	ConceptStore,
	PersistentExpressionStore,
} from "@stateful-mcp/core/middleware/dictionary/interfaces";
import {
	SimpleConceptStore,
	SimplePersistentExpressionStore,
} from "../concept-store";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../dict-backend";
import {
	IndexedDbConceptStoreBackend,
	IndexedDbExpressionStoreBackend,
} from "./dict-backend";

export function createConceptStore(backend: ConceptStoreBackend): ConceptStore {
	return new SimpleConceptStore(backend);
}

export function createExpressionStore(
	backend: ExpressionStoreBackend,
): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(backend);
}

export function createIndexedDbConceptStore(dbName?: string): ConceptStore {
	return new SimpleConceptStore(new IndexedDbConceptStoreBackend(dbName));
}

export function createIndexedDbExpressionStore(
	dbName?: string,
): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(
		new IndexedDbExpressionStoreBackend(dbName),
	);
}
