// REFERENCE: docs/variable.md

import type { PersistentVariableStore } from "../../adapters/storage/interfaces";
import { eventBroker } from "../../events/broker";
import { executePipeline } from "../../translation/pipeline";
import type { ArgRef, OpName, PipelineStep } from "../../translation/types";
import type { VariableExpression, VariableLoweringContext } from "./ast";
import { ancestorBlockIds } from "./ast";
import { lowerVariableExpression } from "./lowerer";
import type {
	ConditionEvaluationResult,
	VariableConditionRule,
	VariableInputEntry,
	VariableMutationEvent,
	VariableService,
	VariableStore,
} from "./types";

function formatScopeKey(sessionId: string, blockInstanceId?: string): string {
	return blockInstanceId ? `${sessionId}:${blockInstanceId}` : `${sessionId}::`;
}

export class MemoryVariableStore implements VariableStore {
	private scopes = new Map<string, Map<string, unknown>>();

	private getScopeMap(
		sessionId: string,
		blockInstanceId?: string,
	): Map<string, unknown> {
		const scopeKey = formatScopeKey(sessionId, blockInstanceId);
		if (!this.scopes.has(scopeKey)) {
			this.scopes.set(scopeKey, new Map<string, unknown>());
		}
		return this.scopes.get(scopeKey)!;
	}

	async save(
		sessionId: string,
		key: string,
		value: unknown,
		blockInstanceId?: string,
	): Promise<void> {
		const map = this.getScopeMap(sessionId, blockInstanceId);
		map.set(key, value);
	}

	async saveBatch(
		sessionId: string,
		variables: Record<string, unknown>,
		blockInstanceId?: string,
	): Promise<void> {
		const map = this.getScopeMap(sessionId, blockInstanceId);
		for (const [k, v] of Object.entries(variables)) {
			map.set(k, v);
		}
	}

	async load(
		sessionId: string,
		key: string,
		blockInstanceId?: string,
	): Promise<unknown> {
		const map = this.getScopeMap(sessionId, blockInstanceId);
		return map.get(key);
	}

	async loadScope(
		sessionId: string,
		blockInstanceId?: string,
	): Promise<Record<string, unknown>> {
		const map = this.getScopeMap(sessionId, blockInstanceId);
		return Object.fromEntries(map.entries());
	}

	async remove(
		sessionId: string,
		key: string,
		blockInstanceId?: string,
	): Promise<void> {
		const map = this.getScopeMap(sessionId, blockInstanceId);
		map.delete(key);
	}

	async clear(sessionId: string, blockInstanceId?: string): Promise<void> {
		const scopeKey = formatScopeKey(sessionId, blockInstanceId);
		this.scopes.delete(scopeKey);
	}
}

export class VariableServiceStore implements VariableService {
	private store: VariableStore;
	private persistentStore?: PersistentVariableStore;
	private listeners = new Map<
		string,
		Set<(event: VariableMutationEvent) => void>
	>();

	constructor(
		store?: VariableStore,
		opts?: { persistentStore?: PersistentVariableStore },
	) {
		this.store = store || new MemoryVariableStore();
		this.persistentStore = opts?.persistentStore;
	}

	async savePersistent(
		sessionId: string,
		key: string,
		value: unknown,
		scope: { level: "global" } | { level: "user"; userId: string },
	): Promise<void> {
		if (this.persistentStore) {
			await this.persistentStore.set(key, value, scope);
		}
	}

	async loadPersistent(
		sessionId: string,
		key: string,
		scope: { level: "global" } | { level: "user"; userId: string },
	): Promise<unknown> {
		if (this.persistentStore) {
			return this.persistentStore.get(key, scope);
		}
		return undefined;
	}

	private notifyListeners(event: VariableMutationEvent): void {
		const sessionListeners = this.listeners.get(event.sessionId);
		if (sessionListeners) {
			for (const listener of sessionListeners) {
				try {
					listener(event);
				} catch (err) {
					console.error("VariableService listener error:", err);
				}
			}
		}

		eventBroker.emitStateChange({
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			service: "variable",
			action: event.operation,
			sessionId: event.sessionId,
			data: {
				blockInstanceId: event.blockInstanceId,
				key: event.key,
				value: event.value,
				timestampUtc: event.timestampUtc,
			},
		});
	}

	async setVariable(
		sessionId: string,
		key: string,
		value: unknown,
		blockInstanceId?: string,
	): Promise<void> {
		await this.store.save(sessionId, key, value, blockInstanceId);
		this.notifyListeners({
			sessionId,
			blockInstanceId,
			operation: "set",
			key,
			value,
			timestampUtc: new Date().toISOString(),
		});
	}

	async updateVariable(
		sessionId: string,
		key: string,
		expression: VariableExpression,
		blockInstanceId?: string,
		context?: VariableLoweringContext,
	): Promise<unknown> {
		const current = await this.getVariable(sessionId, key, blockInstanceId);
		if (current === undefined) {
			throw new Error(`Variable '${key}' does not exist in the active scope`);
		}
		const value = await this.evaluateExpression(
			sessionId,
			expression,
			blockInstanceId,
			context,
		);
		await this.store.save(sessionId, key, value, blockInstanceId);
		this.notifyListeners({
			sessionId,
			blockInstanceId,
			operation: "update",
			key,
			value,
			timestampUtc: new Date().toISOString(),
		});
		return value;
	}

	async setVariables(
		sessionId: string,
		variables: Record<string, unknown> | VariableInputEntry[],
		blockInstanceId?: string,
	): Promise<void> {
		if (Array.isArray(variables)) {
			for (const entry of variables) {
				const targetBlock = entry.blockInstanceId || blockInstanceId;
				// When an entry carries a condition rule but no explicit value, store the
				// condition rule itself as the value so testVariableCondition can retrieve it.
				const storedValue =
					entry.value !== undefined
						? entry.value
						: entry.condition !== undefined
							? { condition: entry.condition }
							: undefined;
				await this.store.save(sessionId, entry.key, storedValue, targetBlock);
				this.notifyListeners({
					sessionId,
					blockInstanceId: targetBlock,
					operation: "set",
					key: entry.key,
					value: storedValue,
					timestampUtc: new Date().toISOString(),
				});
			}
		} else {
			await this.store.saveBatch(sessionId, variables, blockInstanceId);
			for (const [key, value] of Object.entries(variables)) {
				this.notifyListeners({
					sessionId,
					blockInstanceId,
					operation: "set",
					key,
					value,
					timestampUtc: new Date().toISOString(),
				});
			}
		}
	}

	async getVariable<T = unknown>(
		sessionId: string,
		keyOrKeys?: string | string[],
		blockInstanceId?: string,
	): Promise<Record<string, T> | T | undefined> {
		if (keyOrKeys === undefined) {
			return (await this.getScope(sessionId, blockInstanceId)) as Record<
				string,
				T
			>;
		}

		if (Array.isArray(keyOrKeys)) {
			const fullScope = await this.getScope(sessionId, blockInstanceId);
			const result: Record<string, T> = {};
			for (const k of keyOrKeys) {
				if (fullScope[k] !== undefined) {
					result[k] = fullScope[k] as T;
				}
			}
			return result;
		}

		// Walk ancestor chain when blockInstanceId is a chain-encoded scope key.
		// For a single-segment blockId (e.g. "person") this is one iteration.
		const ancestors = blockInstanceId ? ancestorBlockIds(blockInstanceId) : [];
		for (const scopeLevel of ancestors) {
			const val = await this.store.load(sessionId, keyOrKeys, scopeLevel);
			if (val !== undefined) return val as T;
		}
		// Global session fallback
		const globalVal = await this.store.load(sessionId, keyOrKeys);
		return globalVal as T | undefined;
	}

	async getScope(
		sessionId: string,
		blockInstanceId?: string,
	): Promise<Record<string, unknown>> {
		const ancestors = blockInstanceId ? ancestorBlockIds(blockInstanceId) : [];
		const merged: Record<string, unknown> = {};
		// Start from global scope, overlay each ancestor from least to most specific
		const globalScope = await this.store.loadScope(sessionId);
		Object.assign(merged, globalScope);
		for (const scopeLevel of ancestors) {
			const scope = await this.store.loadScope(sessionId, scopeLevel);
			Object.assign(merged, scope);
		}
		return merged;
	}

	async deleteVariable(
		sessionId: string,
		keyOrKeys: string | string[],
		blockInstanceId?: string,
	): Promise<void> {
		const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
		for (const key of keys) {
			await this.store.remove(sessionId, key, blockInstanceId);
			this.notifyListeners({
				sessionId,
				blockInstanceId,
				operation: "remove",
				key,
				timestampUtc: new Date().toISOString(),
			});
		}
	}

	async clearBlockScope(
		sessionId: string,
		blockInstanceId: string,
	): Promise<void> {
		await this.store.clear(sessionId, blockInstanceId);
		this.notifyListeners({
			sessionId,
			blockInstanceId,
			operation: "remove",
			timestampUtc: new Date().toISOString(),
		});
	}

	async testVariableCondition(
		sessionId: string,
		key: string,
		testValue: unknown,
		opOverride?: OpName,
		blockInstanceId?: string,
	): Promise<ConditionEvaluationResult> {
		const rawVal = await this.getVariable(sessionId, key, blockInstanceId);
		let targetOp: OpName = opOverride || "eq";
		let targetVal: unknown = rawVal;
		let targetVals: unknown[] | undefined;
		let storedCondition: VariableConditionRule | undefined;

		if (rawVal !== undefined && typeof rawVal === "object" && rawVal !== null) {
			const obj = rawVal as Record<string, any>;
			if (
				obj.condition &&
				typeof obj.condition === "object" &&
				obj.condition.op
			) {
				storedCondition = obj.condition as VariableConditionRule;
				if (!opOverride) targetOp = storedCondition.op;
				targetVal = storedCondition.targetValue;
				targetVals = storedCondition.targetValues;
			} else if (
				(obj.targetValue !== undefined || obj.targetValues !== undefined) &&
				obj.op
			) {
				storedCondition = {
					op: obj.op,
					targetValue: obj.targetValue,
					targetValues: obj.targetValues,
				};
				if (!opOverride) targetOp = obj.op;
				targetVal = obj.targetValue;
				targetVals = obj.targetValues;
			} else if (obj.value !== undefined) {
				targetVal = obj.value;
			}
		}

		// For set-membership ops, spread all set members as variadic args after testValue.
		// For scalar ops, use a single targetValue.
		const isSetOp = targetOp === "in_set" || targetOp === "not_in_set";
		const testArgs = isSetOp
			? [
					testValue,
					...(targetVals ?? (targetVal !== undefined ? [targetVal] : [])),
				]
			: [testValue, targetVal];

		const testStep: PipelineStep = { op: targetOp, args: testArgs as ArgRef[] };
		const res = executePipeline([testStep], {}, {});
		const passed = Boolean(res);

		const conditionRule: VariableConditionRule =
			storedCondition ||
			(isSetOp
				? { op: targetOp, targetValues: targetVals }
				: { op: targetOp, targetValue: targetVal });

		this.notifyListeners({
			sessionId,
			blockInstanceId,
			operation: "eval",
			key,
			value: { testValue, passed, condition: conditionRule },
			timestampUtc: new Date().toISOString(),
		});

		return {
			key,
			testValue,
			passed,
			condition: conditionRule,
		};
	}

	async evaluatePipeline(
		sessionId: string,
		pipeline: PipelineStep[],
		blockInstanceId?: string,
	): Promise<unknown> {
		const scope = await this.getScope(sessionId, blockInstanceId);
		const result = executePipeline(pipeline, scope, {});
		this.notifyListeners({
			sessionId,
			blockInstanceId,
			operation: "eval",
			value: result,
			timestampUtc: new Date().toISOString(),
		});
		return result;
	}

	async evaluateExpression(
		sessionId: string,
		expression: VariableExpression,
		blockInstanceId?: string,
		context?: VariableLoweringContext,
	): Promise<unknown> {
		const lowered = await lowerVariableExpression(expression, context);
		if (lowered.diagnostics.length > 0) {
			throw new Error(lowered.diagnostics.map((d) => d.message).join("; "));
		}
		if (lowered.steps.length === 0) {
			if ("$literal" in lowered.resultRef) return lowered.resultRef.$literal;
			if ("$var" in lowered.resultRef) {
				return this.getVariable(
					sessionId,
					lowered.resultRef.$var,
					blockInstanceId,
				);
			}
		}
		return this.evaluatePipeline(sessionId, lowered.steps, blockInstanceId);
	}

	async assertExpression(
		sessionId: string,
		expression: VariableExpression,
		blockInstanceId?: string,
		context?: VariableLoweringContext,
	): Promise<boolean> {
		const result = await this.evaluateExpression(
			sessionId,
			expression,
			blockInstanceId,
			context,
		);
		if (!result) throw new Error("Variable assertion failed");
		return true;
	}

	subscribe(
		sessionId: string,
		listener: (event: VariableMutationEvent) => void,
	): () => void {
		if (!this.listeners.has(sessionId)) {
			this.listeners.set(sessionId, new Set());
		}
		const set = this.listeners.get(sessionId)!;
		set.add(listener);

		return () => {
			set.delete(listener);
			if (set.size === 0) {
				this.listeners.delete(sessionId);
			}
		};
	}
}
