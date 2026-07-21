// REFERENCE: docs/variable.md
import type { OpName, PipelineStep } from "../../translation/types";

export type VariableOpType = "set" | "update" | "remove" | "eval";

export interface VariableConditionRule {
	op: OpName;
	/** Single comparison target — used for scalar ops (lt, leq, eq, neq, geq, gt, starts_with, ends_with, contains) */
	targetValue?: unknown;
	/** Set of allowed/disallowed values — used for in_set and not_in_set (numbers, strings, booleans) */
	targetValues?: unknown[];
}

export interface VariableInputEntry {
	key: string;
	value?: unknown;
	condition?: VariableConditionRule;
	blockInstanceId?: string;
}

export interface ConditionEvaluationResult {
	key: string;
	testValue: unknown;
	passed: boolean;
	condition?: VariableConditionRule;
}

export interface VariableMutationEvent {
	sessionId: string;
	blockInstanceId?: string;
	operation: VariableOpType;
	key?: string;
	value?: unknown;
	timestampUtc: string;
}

export interface VariableStore {
	save(
		sessionId: string,
		key: string,
		value: unknown,
		blockInstanceId?: string,
	): Promise<void>;
	saveBatch(
		sessionId: string,
		variables: Record<string, unknown>,
		blockInstanceId?: string,
	): Promise<void>;
	load(
		sessionId: string,
		key: string,
		blockInstanceId?: string,
	): Promise<unknown>;
	loadScope(
		sessionId: string,
		blockInstanceId?: string,
	): Promise<Record<string, unknown>>;
	remove(
		sessionId: string,
		key: string,
		blockInstanceId?: string,
	): Promise<void>;
	clear(sessionId: string, blockInstanceId?: string): Promise<void>;
}

export interface VariableService {
	/** Set or update a single variable within session or block instance scope */
	setVariable(
		sessionId: string,
		key: string,
		value: unknown,
		blockInstanceId?: string,
	): Promise<void>;

	/** Batch set multiple variables (accepts key-value Record or Array of VariableInputEntry objects) */
	setVariables(
		sessionId: string,
		variables: Record<string, unknown> | VariableInputEntry[],
		blockInstanceId?: string,
	): Promise<void>;

	/** Retrieve a single variable value, array of key values, or complete scope */
	getVariable<T = unknown>(
		sessionId: string,
		keyOrKeys?: string | string[],
		blockInstanceId?: string,
	): Promise<Record<string, T> | T | undefined>;

	/** Retrieve the complete key-value scope active for a session / block instance */
	getScope(
		sessionId: string,
		blockInstanceId?: string,
	): Promise<Record<string, unknown>>;

	/** Delete a single variable or array of keys, or purge an entire block instance scope */
	deleteVariable(
		sessionId: string,
		keyOrKeys: string | string[],
		blockInstanceId?: string,
	): Promise<void>;
	clearBlockScope(sessionId: string, blockInstanceId: string): Promise<void>;

	/** Evaluate a test value against a variable's condition rule (e.g. set x leq 20, then evaluate "x" with 25) */
	testVariableCondition(
		sessionId: string,
		key: string,
		testValue: unknown,
		opOverride?: OpName,
		blockInstanceId?: string,
	): Promise<ConditionEvaluationResult>;

	/** Execute an AST Translation Pipeline against the active variable scope */
	evaluatePipeline(
		sessionId: string,
		pipeline: PipelineStep[],
		blockInstanceId?: string,
	): Promise<unknown>;

	/** Subscribe to reactive variable mutation events */
	subscribe(
		sessionId: string,
		listener: (event: VariableMutationEvent) => void,
	): () => void;
}
