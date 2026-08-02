import {
	type CompiledQuery,
	type CreateIndexQuery,
	type CreateTableQuery,
	type InsertQuery,
	QueryCompiler,
	type SelectQuery,
	type SqlDialect,
} from "../../../translation/sql-compiler";

export interface DictionaryCompilerOptions {
	dialect: SqlDialect;
	includeSyncMetadata?: boolean;
	includeRelationCache?: boolean;
}

export interface DictionaryLookupRequest {
	lookupTerm?: string;
	lookupPrefix?: string;
	activeOnly?: boolean;
	conceptId?: string;
	roleName?: string;
	limit?: number;
}

export interface CompiledDictionarySchema {
	ddl: CompiledQuery[];
	indexes: CompiledQuery[];
}

/**
 * PostgreSQL-first dictionary AST compiler. Independent table expressions are
 * intentionally defined before topology-aware joins are added.
 */
export class DictionarySqlCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly options: DictionaryCompilerOptions) {
		this.compiler = new QueryCompiler(options.dialect);
	}

	compileSchema(): CompiledDictionarySchema {
		const tables: CreateTableQuery[] = [
			{
				table: "dict_concepts",
				ifNotExists: true,
				columns: [
					{ name: "id", type: "text", primaryKey: true },
					{ name: "namespace_code", type: "text", nullable: false },
					{ name: "standard_code", type: "text", nullable: false },
					{ name: "display", type: "text", nullable: false },
					{ name: "description", type: "text", nullable: true },
					{ name: "active", type: "bool", nullable: false },
				],
			},
			{
				table: "dict_custom_expressions",
				ifNotExists: true,
				columns: [
					{ name: "id", type: "text", primaryKey: true },
					{ name: "term", type: "text", nullable: false },
					{ name: "lookup_term", type: "text", nullable: true },
					{ name: "concept_id", type: "text", nullable: true },
					{ name: "scope_level", type: "text", nullable: false },
					{ name: "scope_id", type: "text", nullable: true },
					{ name: "priority_weight", type: "real", nullable: true },
					{ name: "active", type: "bool", nullable: false },
					{ name: "data", type: "json", nullable: false },
				],
			},
			{
				table: "concept_filters",
				ifNotExists: true,
				columns: [
					{ name: "filter_id", type: "text", primaryKey: true },
					{ name: "concept_id", type: "text", nullable: false },
					{
						name: "policy",
						type: "text",
						nullable: false,
						check: "policy IN ('whitelist', 'blacklist')",
					},
					{ name: "role_name", type: "text", nullable: false },
					this.options.dialect === "postgres"
						? {
								name: "active",
								type: "bool",
								nullable: false,
								defaultRaw: "TRUE",
							}
						: { name: "active", type: "bool", nullable: false, default: 1 },
				],
			},
		];
		const indexes: CreateIndexQuery[] = [
			{
				table: "dict_concepts",
				name: "idx_dict_concept_coordinate",
				columns: ["namespace_code", "standard_code"],
				ifNotExists: true,
			},
			{
				table: "dict_custom_expressions",
				name: "idx_dict_expression_lookup",
				columns: ["lookup_term", "active", "scope_level", "scope_id"],
				ifNotExists: true,
			},
			{
				table: "dict_custom_expressions",
				name: "idx_dict_expression_concept",
				columns: ["concept_id", "active"],
				ifNotExists: true,
			},
			{
				table: "concept_filters",
				name: "idx_dict_filter_concept_role",
				columns: ["concept_id", "role_name", "active", "policy"],
				ifNotExists: true,
			},
		];
		if (this.options.includeRelationCache) {
			tables.push({
				table: "dict_relation_cache",
				ifNotExists: true,
				columns: [
					{ name: "ancestor_concept_id", type: "text", nullable: false },
					{ name: "descendant_concept_id", type: "text", nullable: false },
					{ name: "link_depth", type: "int", nullable: false },
					{ name: "inferred_relationship_type", type: "text", nullable: false },
					{ name: "active", type: "bool", nullable: false },
				],
				primaryKey: [
					"ancestor_concept_id",
					"descendant_concept_id",
					"inferred_relationship_type",
				],
			});
		}
		return {
			ddl: tables.map((table) => this.compiler.compileCreateTable(table)),
			indexes: indexes.map((index) => this.compiler.compileCreateIndex(index)),
		};
	}

	compileExpressionCandidates(request: DictionaryLookupRequest): CompiledQuery {
		const where: NonNullable<SelectQuery["where"]> = [];
		if (request.lookupTerm !== undefined)
			where.push({
				column: "lookup_term",
				op: "eq",
				value: request.lookupTerm,
			});
		if (request.lookupPrefix !== undefined)
			where.push({
				column: "lookup_term",
				op: "starts_with",
				value: request.lookupPrefix,
			});
		if (request.activeOnly !== false)
			where.push({ column: "active", op: "eq", value: true });
		if (request.conceptId !== undefined)
			where.push({ column: "concept_id", op: "eq", value: request.conceptId });
		const query: SelectQuery = {
			table: "dict_custom_expressions",
			select: [
				{ column: "id" },
				{ column: "lookup_term" },
				{ column: "concept_id" },
				{ column: "priority_weight" },
				{ column: "data" },
			],
			where,
			orderBy: [
				{ column: "priority_weight", direction: "DESC", nulls: "LAST" },
				{ column: "id", direction: "ASC" },
			],
			limit: request.limit ?? 50,
		};
		return this.compiler.compileSelect(query);
	}

	compileJoinedCandidates(request: DictionaryLookupRequest): CompiledQuery {
		const where: NonNullable<SelectQuery["where"]> = [];
		if (request.lookupTerm !== undefined)
			where.push({
				column: "lookup_term",
				table: "e",
				op: "eq",
				value: request.lookupTerm,
			});
		if (request.lookupPrefix !== undefined)
			where.push({
				column: "lookup_term",
				table: "e",
				op: "starts_with",
				value: request.lookupPrefix,
			});
		if (request.activeOnly !== false) {
			where.push({ column: "active", table: "e", op: "eq", value: true });
			where.push({ column: "active", table: "c", op: "eq", value: true });
		}
		if (request.conceptId !== undefined)
			where.push({
				column: "concept_id",
				table: "e",
				op: "eq",
				value: request.conceptId,
			});
		if (request.roleName !== undefined)
			where.push(this.compileFilterEligibility(request.roleName));
		return this.compiler.compileSelect({
			table: "dict_custom_expressions",
			alias: "e",
			select: [
				{ column: "id", table: "e" },
				{ column: "lookup_term", table: "e" },
				{ column: "concept_id", table: "e" },
				{ column: "priority_weight", table: "e" },
				{ column: "data", table: "e" },
				{ column: "namespace_code", table: "c" },
				{ column: "standard_code", table: "c" },
				{ column: "display", table: "c" },
			],
			joins: [
				{
					type: "inner",
					table: "dict_concepts",
					alias: "c",
					on: [
						{
							column: "concept_id",
							table: "e",
							op: "eq",
							rhsExpr: { column: "id", table: "c" },
						},
					],
				},
			],
			where,
			orderBy: [
				{
					column: "priority_weight",
					table: "e",
					direction: "DESC",
					nulls: "LAST",
				},
				{ column: "id", table: "e", direction: "ASC" },
			],
			limit: request.limit ?? 50,
		});
	}

	compileExpressionFilterCandidates(
		request: DictionaryLookupRequest,
	): CompiledQuery {
		const where: NonNullable<SelectQuery["where"]> = [];
		if (request.lookupTerm !== undefined)
			where.push({
				column: "lookup_term",
				table: "e",
				op: "eq",
				value: request.lookupTerm,
			});
		if (request.lookupPrefix !== undefined)
			where.push({
				column: "lookup_term",
				table: "e",
				op: "starts_with",
				value: request.lookupPrefix,
			});
		if (request.activeOnly !== false)
			where.push({ column: "active", table: "e", op: "eq", value: true });
		if (request.conceptId !== undefined)
			where.push({
				column: "concept_id",
				table: "e",
				op: "eq",
				value: request.conceptId,
			});
		if (request.roleName !== undefined)
			where.push(this.compileFilterEligibility(request.roleName));
		return this.compiler.compileSelect({
			table: "dict_custom_expressions",
			alias: "e",
			select: [
				{ column: "id", table: "e" },
				{ column: "lookup_term", table: "e" },
				{ column: "concept_id", table: "e" },
				{ column: "priority_weight", table: "e" },
				{ column: "data", table: "e" },
			],
			where,
			orderBy: [
				{
					column: "priority_weight",
					table: "e",
					direction: "DESC",
					nulls: "LAST",
				},
				{ column: "id", table: "e", direction: "ASC" },
			],
			limit: request.limit ?? 50,
		});
	}

	compileConceptFilterBatch(
		conceptIds: string[],
		roleName?: string,
	): CompiledQuery {
		const where: NonNullable<SelectQuery["where"]> = [
			{ column: "active", op: "eq", value: true },
		];
		if (conceptIds.length > 0)
			where.unshift({ column: "concept_id", op: "in_set", values: conceptIds });
		if (roleName !== undefined)
			where.push({ column: "role_name", op: "eq", value: roleName });
		return this.compiler.compileSelect({
			table: "concept_filters",
			select: [{ column: "*", raw: "*" }],
			where,
		});
	}

	compileConceptFilterUpsert(): CompiledQuery {
		const query: InsertQuery = {
			table: "concept_filters",
			columns: ["filter_id", "concept_id", "policy", "role_name", "active"],
			onConflict: "replace",
			conflictColumns: ["filter_id"],
		};
		return this.compiler.compileInsert(query);
	}

	compileConceptFilterDelete(): CompiledQuery {
		return this.compiler.compileDelete({
			table: "concept_filters",
			where: [{ column: "filter_id", op: "eq" }],
		});
	}

	private compileFilterEligibility(roleName: string) {
		const blacklist: SelectQuery = {
			table: "concept_filters",
			alias: "fb",
			select: [{ raw: "1" }],
			where: [
				{
					column: "concept_id",
					table: "fb",
					op: "eq",
					rhsExpr: { column: "concept_id", table: "e" },
				},
				{ column: "role_name", table: "fb", op: "eq", value: roleName },
				{ column: "active", table: "fb", op: "eq", value: true },
				{ column: "policy", table: "fb", op: "eq", value: "blacklist" },
			],
		};
		const anyActive: SelectQuery = {
			table: "concept_filters",
			alias: "fa",
			select: [{ raw: "1" }],
			where: [
				{
					column: "concept_id",
					table: "fa",
					op: "eq",
					rhsExpr: { column: "concept_id", table: "e" },
				},
				{ column: "role_name", table: "fa", op: "eq", value: roleName },
				{ column: "active", table: "fa", op: "eq", value: true },
			],
		};
		const whitelist: SelectQuery = {
			table: "concept_filters",
			alias: "fw",
			select: [{ raw: "1" }],
			where: [
				{
					column: "concept_id",
					table: "fw",
					op: "eq",
					rhsExpr: { column: "concept_id", table: "e" },
				},
				{ column: "role_name", table: "fw", op: "eq", value: roleName },
				{ column: "active", table: "fw", op: "eq", value: true },
				{ column: "policy", table: "fw", op: "eq", value: "whitelist" },
			],
		};
		return {
			AND: [
				{ NOT_EXISTS: blacklist },
				{ OR: [{ NOT_EXISTS: anyActive }, { EXISTS: whitelist }] },
			],
		};
	}
}
