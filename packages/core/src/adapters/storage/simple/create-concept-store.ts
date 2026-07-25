import type { ConceptStore } from "../../../middleware/dictionary/interfaces";
import { SimpleConceptStore } from "./concept-store";
import type { ConceptStoreBackend } from "./dict-backend";
import { JsonlConceptStoreBackend } from "./jsonl/dict-backend";
import { MemoryConceptStoreBackend } from "./memory/dict-backend";

export function createConceptStore(backend: ConceptStoreBackend): ConceptStore {
	return new SimpleConceptStore(backend);
}

export function createMemoryConceptStore(): ConceptStore {
	return new SimpleConceptStore(new MemoryConceptStoreBackend());
}

export function createJsonlConceptStore(filePath: string): ConceptStore {
	return new SimpleConceptStore(new JsonlConceptStoreBackend(filePath));
}
