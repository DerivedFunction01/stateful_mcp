import type { OwnerScope } from "../../../config/types";
import type {
	ConceptStore,
	ExpressionSearchRequest,
	PersistentExpressionStore,
} from "../../../middleware/dictionary/interfaces";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "../../../middleware/dictionary/types";
import {
	normalizeLookupTerm,
	tokenizeLookupQuery,
} from "../../../middleware/dictionary/types";
import { SCHEMA } from "../store-schema";
import type { SqlBackend } from "./backend";
import {
	rowToConcept,
	rowToExpression,
	rowToNamespace,
	rowToRelation,
} from "./concept-entity-config";

export class ConceptRepoStore implements ConceptStore {
	constructor(private backend: SqlBackend) {}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		const schema = SCHEMA[this.backend.dialect];
		const sql = namespaceCode
			? schema.selects.SQL_SEARCH_DICT_CONCEPTS_BY_NAMESPACE!.sql
			: schema.selects.SQL_SEARCH_DICT_CONCEPTS!.sql;
		const params = namespaceCode
			? [`%${query}%`, query, query, `%${query}%`, namespaceCode]
			: [`%${query}%`, query, query, `%${query}%`];
		const rows = await this.backend.query(sql, params);
		return rows.map(rowToConcept);
	}

	async getById(id: string): Promise<Concept | null> {
		const schema = SCHEMA[this.backend.dialect];
		const row = await this.backend.queryOne(
			schema.selects.SQL_SELECT_DICT_CONCEPT_BY_ID!.sql,
			[id],
		);
		return row ? rowToConcept(row) : null;
	}

	async getByIds(ids: string[]): Promise<Concept[]> {
		if (ids.length === 0) return [];
		const concepts = await Promise.all(ids.map((id) => this.getById(id)));
		return concepts.filter((concept): concept is Concept => concept !== null);
	}

	async listNamespaces(): Promise<Namespace[]> {
		const schema = SCHEMA[this.backend.dialect];
		const rows = await this.backend.query(
			schema.selects.SQL_SELECT_DICT_NAMESPACES!.sql,
		);
		return rows.map(rowToNamespace);
	}

	async addConcept(concept: Concept): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		await this.backend.exec(schema.inserts.SQL_UPSERT_DICT_CONCEPT!.sql, [
			concept.id,
			concept.namespaceCode,
			concept.standardCode,
			concept.display,
			concept.description || null,
			concept.designationDate || null,
			concept.active !== false,
		]);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		await this.backend.exec(schema.inserts.SQL_UPSERT_DICT_NAMESPACE!.sql, [
			namespace.code,
			namespace.description || null,
			namespace.isPublic,
			namespace.isExternalPrivate,
			namespace.isMutable !== false,
		]);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		await this.backend.exec(schema.inserts.SQL_UPSERT_DICT_RELATION!.sql, [
			relation.id,
			relation.conceptId,
			relation.linkedId,
			relation.relationshipType,
			relation.active !== false,
			relation.designationDate || null,
		]);
		await this.invalidateRelationCache();
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		if (conceptId) {
			await this.backend.exec(
				schema.deletes.SQL_DELETE_DICT_RELATION_CACHE_FOR!.sql,
				[conceptId, conceptId],
			);
		} else {
			await this.backend.exec(
				schema.deletes.SQL_DELETE_DICT_RELATION_CACHE!.sql,
			);
		}
	}

	async getRelations(
		conceptId: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
		const schema = SCHEMA[this.backend.dialect];
		const sqlParts: string[] = [];
		const params: any[] = [];

		if (direction === "forward" || direction === "both") {
			sqlParts.push(schema.selects.SQL_SELECT_DICT_RELATIONS_FORWARD!.sql);
			params.push(conceptId);
		}

		if (direction === "reverse" || direction === "both") {
			sqlParts.push(schema.selects.SQL_SELECT_DICT_RELATIONS_REVERSE!.sql);
			params.push(conceptId);
		}

		if (sqlParts.length === 0) return [];
		const rows = await this.backend.query(sqlParts.join(" UNION ALL "), params);
		return rows.map(rowToRelation);
	}

	async getRelatedConcepts(
		conceptId: string,
		direction: TraversalDirection = "both",
		maxDepth = 3,
		useCache = true,
	): Promise<RelatedConceptResult[]> {
		const schema = SCHEMA[this.backend.dialect];

		if (useCache && direction === "forward") {
			const cached = await this.backend.query(
				schema.selects.SQL_SELECT_DICT_CACHE_RELATED!.sql,
				[conceptId, maxDepth],
			);

			if (cached.length > 0) {
				return cached.map((r: any) => ({
					concept: rowToConcept(r),
					relationshipType: r.inferred_relationship_type,
					direction: "forward",
					depth: r.link_depth,
				}));
			}
		}

		const cteKey =
			direction === "forward"
				? "FORWARD"
				: direction === "reverse"
					? "REVERSE"
					: "BOTH";
		const cte = schema.conceptCtes[cteKey]!;
		const params: any[] =
			direction === "both"
				? [conceptId, conceptId, maxDepth, maxDepth]
				: [conceptId, maxDepth];

		const rows = await this.backend.query(cte.sql, params);

		const results: RelatedConceptResult[] = rows.map((r: any) => ({
			concept: rowToConcept(r),
			relationshipType: r.relationship_type,
			direction: r.dir,
			depth: r.depth,
		}));

		if (useCache && direction === "forward" && results.length > 0) {
			const now = new Date().toISOString();
			for (const res of results) {
				await this.backend.exec(
					schema.inserts.SQL_UPSERT_DICT_RELATION_CACHE!.sql,
					[conceptId, res.concept.id, res.depth, res.relationshipType, now],
				);
			}
		}

		return results;
	}
}

export class ExpressionRepoStore implements PersistentExpressionStore {
	constructor(private backend: SqlBackend) {}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		await this.backend.exec(schema.inserts.SQL_UPSERT_DICT_EXPRESSION!.sql, [
			expression.id,
			expression.term,
			expression.lookupTerm ?? normalizeLookupTerm(expression.term),
			expression.conceptId || null,
			scope.level,
			scope.level === "user" ? scope.userId : null,
			expression.priorityWeight ?? null,
			expression.active !== false,
			JSON.stringify(expression),
		]);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const schema = SCHEMA[this.backend.dialect];
		await this.backend.exec(schema.deletes.SQL_DELETE_DICT_EXPRESSION!.sql, [
			id,
			scope.level,
			scope.level === "user" ? scope.userId : null,
		]);
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const schema = SCHEMA[this.backend.dialect];
		const sql =
			scope.level === "global" || !includeGlobal
				? schema.selects.SQL_SELECT_DICT_EXPRESSION_USER!.sql
				: schema.selects.SQL_SELECT_DICT_EXPRESSION_ALL!.sql;
		const params =
			scope.level === "global"
				? [scope.level, null]
				: [scope.level, scope.userId];
		const rows = await this.backend.query(sql, params);
		return rows.map(rowToExpression);
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const schema = SCHEMA[this.backend.dialect];
		const row = await this.backend.queryOne(
			schema.selects.SQL_SELECT_DICT_EXPRESSION_DATA!.sql,
			[id],
		);
		return row ? rowToExpression(row) : null;
	}

	async searchCandidates(
		request: ExpressionSearchRequest,
	): Promise<CustomExpression[]> {
		const schema = SCHEMA[this.backend.dialect];
		const normalizedQuery = request.query
			? normalizeLookupTerm(request.query)
			: undefined;
		const lookup = request.lookupTerm
			? normalizeLookupTerm(request.lookupTerm)
			: undefined;
		const queryValues = request.lookupTerm
			? [lookup]
			: [...tokenizeLookupQuery(normalizedQuery ?? ""), ""];
		const rowMap = new Map<string, Record<string, unknown>>();
		for (const value of queryValues) {
			const rows = await this.backend.query(
				schema.selects.SQL_SEARCH_DICT_EXPRESSIONS!.sql,
				[`%${value ?? ""}%`, `%${value ?? ""}%`, true],
			);
			for (const row of rows) {
				const id = String(row.id ?? row.lookup_term ?? "");
				if (id) rowMap.set(id, row);
			}
			if (rowMap.size > 0 || request.lookupTerm) break;
		}
		return [...rowMap.values()]
			.map((row) => ({ row, expression: rowToExpression(row) }))
			.filter(({ row, expression }) => {
				if (request.scope) {
					const level = request.scope.level;
					const scopeMatches =
						(row.scope_level === level &&
							(level !== "user" || row.scope_id === request.scope.userId)) ||
						(level !== "global" && row.scope_level === "global");
					if (!scopeMatches) return false;
				}
				const key =
					expression.lookupTerm ??
					expression.term
						.normalize("NFKC")
						.trim()
						.toLocaleLowerCase()
						.replace(/\s+/g, " ");
				if (request.lookupTerm && key !== request.lookupTerm) return false;
				if (request.lookupPrefix && !key.startsWith(request.lookupPrefix))
					return false;
				return !request.activeOnly || expression.active;
			})
			.map(({ expression }) => expression)
			.slice(0, request.limit ?? 50);
	}
}
