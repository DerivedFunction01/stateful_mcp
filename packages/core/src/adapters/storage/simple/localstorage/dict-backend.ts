declare const window: any;
type Storage = any;

import type {
	ConceptRelation,
	CustomExpression,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	DictDelta,
	ExpressionStoreBackend,
} from "../dict-backend";

function getBrowserStorage(): Storage | null {
	if (typeof window !== "undefined" && window.localStorage) {
		return window.localStorage;
	}
	return null;
}

const CONCEPT_PREFIX = "dict_concept:";
const NAMESPACE_PREFIX = "dict_namespace:";
const RELATION_PREFIX = "dict_relation:";

export class LocalStorageConceptStoreBackend implements ConceptStoreBackend {
	async load(
		concepts: Map<string, any>,
		namespaces: Map<string, any>,
		relations: ConceptRelation[],
	): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (!key) continue;
			const raw = storage.getItem(key);
			if (!raw) continue;

			if (key.startsWith(CONCEPT_PREFIX)) {
				const c = JSON.parse(raw);
				concepts.set(c.id, c);
			} else if (key.startsWith(NAMESPACE_PREFIX)) {
				const ns = JSON.parse(raw);
				namespaces.set(ns.code, ns);
			} else if (key.startsWith(RELATION_PREFIX)) {
				relations.push(JSON.parse(raw));
			}
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (const delta of deltas) {
			if (delta.op === "set" && delta.data) {
				if (delta.kind === "concept") {
					storage.setItem(
						CONCEPT_PREFIX + delta.id,
						JSON.stringify(delta.data),
					);
				} else if (delta.kind === "namespace") {
					storage.setItem(
						NAMESPACE_PREFIX + delta.id,
						JSON.stringify(delta.data),
					);
				} else if (delta.kind === "relation") {
					storage.setItem(
						RELATION_PREFIX + delta.id,
						JSON.stringify(delta.data),
					);
				}
			} else if (delta.op === "delete") {
				if (delta.kind === "concept") {
					storage.removeItem(CONCEPT_PREFIX + delta.id);
				} else if (delta.kind === "namespace") {
					storage.removeItem(NAMESPACE_PREFIX + delta.id);
				} else if (delta.kind === "relation") {
					storage.removeItem(RELATION_PREFIX + delta.id);
				}
			}
		}
	}
}

const EXPRESSION_PREFIX = "dict_expression:";

export class LocalStorageExpressionStoreBackend
	implements ExpressionStoreBackend
{
	async load(expressions: CustomExpression[]): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(EXPRESSION_PREFIX)) {
				const raw = storage.getItem(key);
				if (raw) expressions.push(JSON.parse(raw));
			}
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (const delta of deltas) {
			if (delta.kind !== "expression") continue;
			if (delta.op === "set" && delta.data) {
				storage.setItem(
					EXPRESSION_PREFIX + delta.id,
					JSON.stringify(delta.data),
				);
			} else if (delta.op === "delete") {
				storage.removeItem(EXPRESSION_PREFIX + delta.id);
			}
		}
	}
}
