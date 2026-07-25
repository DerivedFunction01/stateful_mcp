declare const window: any;
type Storage = any;

import type {
	ConceptRelation,
	CustomExpression,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../dict-backend";

function getBrowserStorage(): Storage | null {
	if (typeof window !== "undefined" && window.localStorage) {
		return window.localStorage;
	}
	return null;
}

const CONCEPT_PREFIX = "dict_concepts:";
const NAMESPACES_KEY = "dict_namespaces";
const RELATIONS_KEY = "dict_relations";

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
			} else if (key === NAMESPACES_KEY) {
				for (const ns of JSON.parse(raw)) {
					namespaces.set(ns.code, ns);
				}
			} else if (key === RELATIONS_KEY) {
				relations.push(...JSON.parse(raw));
			}
		}
	}

	async save(
		concepts: Map<string, any>,
		namespaces: Map<string, any>,
		relations: ConceptRelation[],
	): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (let i = storage.length - 1; i >= 0; i--) {
			const key = storage.key(i);
			if (
				key &&
				(key.startsWith(CONCEPT_PREFIX) ||
					key === NAMESPACES_KEY ||
					key === RELATIONS_KEY)
			) {
				storage.removeItem(key);
			}
		}

		for (const c of concepts.values()) {
			storage.setItem(CONCEPT_PREFIX + c.id, JSON.stringify(c));
		}
		storage.setItem(
			NAMESPACES_KEY,
			JSON.stringify(Array.from(namespaces.values())),
		);
		storage.setItem(RELATIONS_KEY, JSON.stringify(relations));
	}
}

const EXPRESSION_PREFIX = "dict_expressions:";

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

	async save(expressions: CustomExpression[]): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;

		for (let i = storage.length - 1; i >= 0; i--) {
			const key = storage.key(i);
			if (key && key.startsWith(EXPRESSION_PREFIX)) {
				storage.removeItem(key);
			}
		}

		for (const e of expressions) {
			storage.setItem(EXPRESSION_PREFIX + e.id, JSON.stringify(e));
		}
	}
}
