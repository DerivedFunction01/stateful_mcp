import type {
	CompiledQuery,
	SqlDialect,
} from "../../../translation/sql-compiler";
import {
	type DictionaryLookupRequest,
	DictionarySqlCompiler,
} from "./dict-compiler";

export type DictionaryDomain = "concepts" | "expressions" | "filters";
export type DictionaryBackendKind = "sql" | "kv" | "memory" | "remote";

export interface DictionaryStoreLocation {
	domain: DictionaryDomain;
	backendKind: DictionaryBackendKind;
	connectionId?: string;
	tenantId?: string;
	schema?: string;
	dialect?: SqlDialect;
	read?: boolean;
	write?: boolean;
	syncWrite?: boolean;
}

export interface DictionaryStorageTopology {
	concepts: DictionaryStoreLocation;
	expressions: DictionaryStoreLocation;
	filters: DictionaryStoreLocation;
}

export type DictionaryPlanKind =
	| "sql_join_all"
	| "sql_join_pair"
	| "bounded_hydration"
	| "application_only";

export interface DictionaryExecutionPlan {
	kind: DictionaryPlanKind;
	joinGroup: DictionaryDomain[];
	followUpDomains: DictionaryDomain[];
	statements: CompiledQuery[];
	reason: string;
}

/** Chooses topology and execution strategy; SQL construction stays in DictionarySqlCompiler. */
export class DictionaryQueryPlanner {
	constructor(
		private readonly compilerFactory = (dialect: SqlDialect) =>
			new DictionarySqlCompiler({ dialect }),
	) {}

	plan(
		topology: DictionaryStorageTopology,
		request: DictionaryLookupRequest,
	): DictionaryExecutionPlan {
		const expressions = topology.expressions;
		if (expressions.backendKind !== "sql" || expressions.read === false) {
			return {
				kind: "application_only",
				joinGroup: [],
				followUpDomains: ["concepts", "expressions", "filters"],
				statements: [],
				reason:
					"Expression candidates are not available from a readable SQL store.",
			};
		}

		const dialect = expressions.dialect ?? "postgres";
		const compiler = this.compilerFactory(dialect);
		const expressionConceptJoin = this.canJoin(expressions, topology.concepts);
		const expressionFilterJoin = this.canJoin(expressions, topology.filters);

		if (expressionConceptJoin && expressionFilterJoin) {
			return {
				kind: "sql_join_all",
				joinGroup: ["expressions", "concepts", "filters"],
				followUpDomains: [],
				statements: [compiler.compileJoinedCandidates(request)],
				reason:
					"All dictionary lookup domains share a readable SQL connection and tenant boundary.",
			};
		}

		if (expressionConceptJoin) {
			return {
				kind: "sql_join_pair",
				joinGroup: ["expressions", "concepts"],
				followUpDomains: request.roleName ? ["filters"] : [],
				statements: [
					compiler.compileJoinedCandidates({ ...request, roleName: undefined }),
				],
				reason: expressionFilterJoin
					? "Expression/concept join selected; filter role was omitted from this pair plan."
					: "Expressions and concepts share SQL; filters require bounded follow-up evaluation.",
			};
		}

		if (expressionFilterJoin) {
			return {
				kind: "sql_join_pair",
				joinGroup: ["expressions", "filters"],
				followUpDomains: ["concepts"],
				statements: [compiler.compileExpressionFilterCandidates(request)],
				reason:
					"Expressions and filters share SQL; concepts require bounded follow-up hydration.",
			};
		}

		return {
			kind: "bounded_hydration",
			joinGroup: [],
			followUpDomains: request.roleName
				? ["concepts", "filters"]
				: ["concepts"],
			statements: [compiler.compileExpressionCandidates(request)],
			reason:
				"Expression SQL candidates require application-level concept/filter hydration.",
		};
	}

	private canJoin(
		left: DictionaryStoreLocation,
		right: DictionaryStoreLocation,
	): boolean {
		return (
			left.backendKind === "sql" &&
			right.backendKind === "sql" &&
			left.read !== false &&
			right.read !== false &&
			left.connectionId !== undefined &&
			left.connectionId === right.connectionId &&
			(left.tenantId ?? "") === (right.tenantId ?? "") &&
			(left.schema ?? "public") === (right.schema ?? "public")
		);
	}
}
