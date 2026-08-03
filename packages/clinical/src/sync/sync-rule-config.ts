import type { PropertyTranslation } from "@stateful-mcp/core";
import type { FactCertainty } from "../workspaces/workspace-types";

/**
 * A sync rule maps clinical document records at specific locations to workspace
 * facts. The rule can be scoped by document path, macro definition, and/or
 * schema name. Field-level transforms reuse the core `PropertyTranslation`
 * model to avoid a fourth transformation system.
 */
export interface SyncRule {
	/** Human-readable identifier for this rule. */
	ruleId: string;
	/**
	 * Optional: source document path scope (e.g. "objective.vitals").
	 * Matching uses `normalizeSchemaPath`-style exact normalization.
	 * When omitted, rule applies to any clinical record matching the other filters.
	 */
	sourcePath?: string;
	/** Optional: restrict to records produced by a specific macro definition. */
	sourceMacroId?: string;
	/** Optional: restrict to a specific schema (further filtering on top of path). */
	sourceSchema?: string;
	/** The workspace schema to create facts for (e.g. "Observation", "Vital"). */
	targetSchema: string;
	/**
	 * Which workspace branch receives synced facts.
	 * "active" resolves to the workspace's current active branch at sync time.
	 */
	targetBranchId?: string | "active";
	/**
	 * Property mapping: each TypedFact field name maps to a PropertyTranslation.
	 * - `internal`: path within the clinical record's values (e.g. "concept")
	 * - `transform.pipeline`: optional PipelineStep[] for value reshaping
	 *
	 * Reuses the core translation model — identity mapping when no pipeline is present.
	 */
	propertyMapping: Record<string, PropertyTranslation>;
	/** Constant values injected into every synced TypedFact produced by this rule. */
	constants?: Record<string, unknown>;
	/** Default certainty when the clinical record does not carry one. */
	defaultCertainty?: FactCertainty;
}

export interface SyncConfig {
	rules: SyncRule[];
}

export interface SyncRuleMatch {
	rule: SyncRule;
	/** The clinical record values to extract facts from. */
	values: Record<string, unknown>;
	/** The clinical record's provenance (location/producer info). */
	provenance?: Record<string, unknown>;
}

/** Evaluated result ready to be applied to the workspace. */
export interface SyncResult {
	operation: "add_fact" | "remove_fact";
	factId?: string;
	targetSchema: string;
	targetBranchId?: string | "active";
	certainty?: FactCertainty;
	values: Record<string, unknown>;
	provenance: Record<string, unknown>;
}
