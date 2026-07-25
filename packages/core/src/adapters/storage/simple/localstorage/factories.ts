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
	LocalStorageConceptStoreBackend,
	LocalStorageExpressionStoreBackend,
} from "./dict-backend";

export function createConceptStore(backend: ConceptStoreBackend): ConceptStore {
	return new SimpleConceptStore(backend);
}

export function createExpressionStore(
	backend: ExpressionStoreBackend,
): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(backend);
}

export function createLocalStorageConceptStore(): ConceptStore {
	return new SimpleConceptStore(new LocalStorageConceptStoreBackend());
}

export function createLocalStorageExpressionStore(): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(
		new LocalStorageExpressionStoreBackend(),
	);
}
