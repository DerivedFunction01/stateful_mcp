/**
 * Configuration contract for generic store orchestrators.
 *
 * Each entity family (filters, objects, events, forms) supplies a config so the
 * generic store can remain entity-agnostic while still using the correct field
 * names, ID prefixes, and table names.
 */

import type { OwnerScope } from "../../config/types";

/**
 * Strategy for resolving scope information from state objects and queries.
 */
export interface ScopeStrategy {
	/**
	 * Extract the parent/owner identifier from a state object.
	 * For session stores this is the sessionId.
	 * For persistent stores this is userId or null for global.
	 */
	getScopeId(state: any): string | null;

	/**
	 * Build a WHERE clause fragment for scoped queries.
	 */
	buildScopeFilter(
		alias: string,
		scope: OwnerScope,
	): { sql: string; params: any[] };

	/**
	 * Extract the display name of the scope level from a row.
	 */
	readScopeLevel(row: any): string;

	/**
	 * Extract the user/owner identifier from a row.
	 */
	readScopeId(row: any): string | null;
}

/**
 * Create a scope strategy for session-scoped data keyed by sessionId.
 */
export function sessionScopeStrategy(
	sessionIdField: string = "session_id",
): ScopeStrategy {
	return {
		getScopeId: (state) => state.sessionId ?? null,
		buildScopeFilter: (alias: string, scope: OwnerScope) => {
			const scopeId = scope.level === "user" ? scope.userId : null;
			return {
				sql: `${alias}.session_id = $1 AND ${alias}.scope_level = 'session'`,
				params: [scopeId || ""],
			};
		},
		readScopeLevel: (row) => row.scope_level,
		readScopeId: (row) => row.session_id,
	};
}

/**
 * Create a scope strategy for persistent-scoped data with user/global levels.
 */
export function persistentScopeStrategy(): ScopeStrategy {
	return {
		getScopeId: (state) => state.scope?.userId ?? null,
		buildScopeFilter: (alias: string, scope: OwnerScope) => {
			const scopeId = scope.level === "user" ? scope.userId : null;
			return {
				sql: `${alias}.scope_level = $1 AND (${alias}.user_id = $2 OR ${alias}.user_id IS NULL)`,
				params: [scope.level, scopeId],
			};
		},
		readScopeLevel: (row) => row.scope_level,
		readScopeId: (row) => row.user_id ?? null,
	};
}

/**
 * Entity-specific configuration that lets one generic store serve all families.
 */
export interface StoreConfig {
	/** The state field that holds the entity ID (e.g. "filterId", "objectId") */
	idField: string;

	/** Prefix for auto-generated IDs (e.g. "filter_", "obj_", "commit_", "form_") */
	idPrefix: string;

	/** Primary table name (e.g. "filters", "objects", "events", "forms") */
	tableName: string;

	/** Extract the parent ID from a state object, or null if none */
	getParentId: (state: any) => string | null;

	/** Timestamp field name on session rows */
	createdAtField: string;

	/** Optional alias table name; when omitted alias ops are no-ops */
	aliasTable?: string;

	/** Scope strategy for this store */
	scope: ScopeStrategy;
}

/**
 * Pre-built configs for the four entity families.
 * These mirror the current adapter implementations exactly.
 */
export const FILTER_CONFIG: StoreConfig = {
	idField: "filterId",
	idPrefix: "filter_",
	tableName: "filters",
	getParentId: (state) => state.parentFilterId,
	createdAtField: "created_at",
	aliasTable: "session_aliases",
	scope: sessionScopeStrategy("session_id"),
};

export const OBJECT_CONFIG: StoreConfig = {
	idField: "objectId",
	idPrefix: "obj_",
	tableName: "objects",
	getParentId: (state) => state.parentObjectId,
	createdAtField: "created_at",
	aliasTable: "object_session_aliases",
	scope: sessionScopeStrategy("session_id"),
};

export const EVENT_CONFIG: StoreConfig = {
	idField: "commitId",
	idPrefix: "commit_",
	tableName: "events",
	getParentId: (state) => state.parentCommitId,
	createdAtField: "created_at",
	aliasTable: "event_session_aliases",
	scope: sessionScopeStrategy("session_id"),
};

export const FORM_CONFIG: StoreConfig = {
	idField: "formId",
	idPrefix: "form_",
	tableName: "forms",
	getParentId: (state) => state.parentFormId,
	createdAtField: "created_at",
	aliasTable: "form_session_aliases",
	scope: sessionScopeStrategy("session_id"),
};
