import type { PersistentExpressionStore } from "../../../middleware/dictionary/interfaces";
import { SimplePersistentExpressionStore } from "./concept-store";
import type { ExpressionStoreBackend } from "./dict-backend";
import { JsonlExpressionStoreBackend } from "./jsonl/dict-backend";
import { MemoryExpressionStoreBackend } from "./memory/dict-backend";

export function createExpressionStore(
	backend: ExpressionStoreBackend,
): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(backend);
}

export function createMemoryExpressionStore(): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(
		new MemoryExpressionStoreBackend(),
	);
}

export function createJsonlExpressionStore(
	filePath: string,
): PersistentExpressionStore {
	return new SimplePersistentExpressionStore(
		new JsonlExpressionStoreBackend(filePath),
	);
}
