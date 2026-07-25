import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
} from "../../../middleware/dictionary/types";

export interface ConceptStoreBackend {
	load(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void>;

	save(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void>;
}

export interface ExpressionStoreBackend {
	load(expressions: CustomExpression[]): Promise<void>;
	save(expressions: CustomExpression[]): Promise<void>;
}
