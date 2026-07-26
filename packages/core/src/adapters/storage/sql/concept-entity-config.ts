import type {
	Concept,
	ConceptRelation,
	Namespace,
} from "../../../middleware/dictionary/types";

export const conceptDdlKeys = {
	ddl: [
		"DDL_DICT_NAMESPACES",
		"DDL_DICT_CONCEPTS",
		"DDL_DICT_RELATIONS",
		"DDL_DICT_RELATION_CACHE",
	],
	ddlIndexes: [
		"IDX_CONCEPT_REL_FORWARD",
		"IDX_CONCEPT_REL_REVERSE",
		"IDX_CONCEPT_CACHE_TRAVERSAL",
	],
};

export const expressionDdlKeys = {
	ddl: ["DDL_DICT_CUSTOM_EXPRESSIONS"],
	ddlIndexes: [],
};

export function conceptToRow(concept: Concept): Record<string, any> {
	return {
		id: concept.id,
		namespace_code: concept.namespaceCode,
		standard_code: concept.standardCode,
		display: concept.display,
		description: concept.description || null,
		designation_date: concept.designationDate || null,
		active: concept.active !== false,
	};
}

export function rowToConcept(row: Record<string, any>): Concept {
	return {
		id: row.id,
		namespaceCode: row.namespace_code,
		standardCode: row.standard_code,
		display: row.display,
		description: row.description || undefined,
		designationDate: row.designation_date || undefined,
		active: row.active,
	};
}

export function namespaceToRow(ns: Namespace): Record<string, any> {
	return {
		code: ns.code,
		description: ns.description || null,
		is_public: ns.isPublic,
		is_external_private: ns.isExternalPrivate,
		is_mutable: ns.isMutable !== false,
	};
}

export function rowToNamespace(row: Record<string, any>): Namespace {
	return {
		code: row.code,
		description: row.description || undefined,
		isPublic: row.is_public,
		isExternalPrivate: row.is_external_private,
		isMutable: row.is_mutable,
	};
}

export function relationToRow(rel: ConceptRelation): Record<string, any> {
	return {
		id: rel.id,
		concept_id: rel.conceptId,
		linked_id: rel.linkedId,
		relationship_type: rel.relationshipType,
		active: rel.active !== false,
		designation_date: rel.designationDate || null,
	};
}

export function rowToRelation(row: Record<string, any>): ConceptRelation {
	return {
		id: row.id,
		conceptId: row.concept_id,
		linkedId: row.linked_id,
		relationshipType: row.relationship_type,
		active: row.active,
		designationDate: row.designation_date || undefined,
	};
}

export function expressionToRow(
	expression: any,
	scope: { level: string; userId?: string | null },
): Record<string, any> {
	const scopeId = scope.level === "user" ? scope.userId : null;
	return {
		id: expression.id,
		term: expression.term,
		concept_id: expression.conceptId || null,
		scope_level: scope.level,
		scope_id: scopeId,
		data: JSON.stringify(expression),
	};
}

export function rowToExpression(row: Record<string, any>): any {
	return typeof row.data === "string" ? JSON.parse(row.data) : row.data;
}
