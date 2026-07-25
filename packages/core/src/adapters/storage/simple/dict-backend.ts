import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
} from "../../../middleware/dictionary/types";

export interface DictDelta {
	kind: "concept" | "namespace" | "relation" | "expression";
	op: "set" | "delete";
	id: string;
	data?: any;
}

export interface ConceptStoreBackend {
	load(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void>;

	saveDelta(deltas: DictDelta[]): Promise<void>;
}

export interface ExpressionStoreBackend {
	load(expressions: CustomExpression[]): Promise<void>;
	saveDelta(deltas: DictDelta[]): Promise<void>;
}
