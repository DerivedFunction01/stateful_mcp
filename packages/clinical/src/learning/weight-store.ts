import type { KvBackend, SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { WeightQueryCompiler } from "../stores/sql/weight-query-compiler";
import type {
	SystemWeightFeedbackUpdate,
	SystemWeightStore,
} from "./interfaces";

const DEFAULT_WEIGHT = 1.0;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 5.0;

function boundedFeedbackDelta(update: SystemWeightFeedbackUpdate): number {
	if (!Number.isFinite(update.delta))
		throw new Error("Feedback delta must be finite");
	const learningRate = update.learningRate ?? 1;
	if (!Number.isFinite(learningRate) || learningRate < 0) {
		throw new Error(
			"Feedback learning rate must be a non-negative finite number",
		);
	}
	return update.delta * learningRate;
}

function clampWeight(
	value: number,
	min = MIN_WEIGHT,
	max = MAX_WEIGHT,
): number {
	if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
		throw new Error("Invalid weight bounds");
	}
	return Math.min(max, Math.max(min, value));
}

export class KvBackendSystemWeightStore implements SystemWeightStore {
	constructor(private backend: KvBackend) {}
	private writeTail: Promise<void> = Promise.resolve();

	private storageKey(category: string, key: string): string {
		return `weights:${category}:${key}`;
	}

	private async loadWeights(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
		const data = await this.backend.load();
		const raw = data[this.storageKey(category, key)];
		if (raw && typeof raw === "object") {
			return raw as Record<string, number>;
		}
		return {};
	}

	private async persistWeights(
		category: string,
		key: string,
		weights: Record<string, number>,
	): Promise<void> {
		await this.backend.set(this.storageKey(category, key), weights);
		await this.backend.save();
	}

	private enqueueWrite(operation: () => Promise<void>): Promise<void> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	async getWeight(
		category: string,
		key: string,
		subKey?: string,
	): Promise<number> {
		if (!subKey) {
			const data = await this.backend.load();
			const val = data[this.storageKey(category, key)];
			return typeof val === "number" ? val : DEFAULT_WEIGHT;
		}
		const weights = await this.loadWeights(category, key);
		return weights[subKey] ?? DEFAULT_WEIGHT;
	}

	async setWeight(
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): Promise<void> {
		if (!subKey) {
			await this.backend.set(this.storageKey(category, key), value);
			await this.backend.save();
			return;
		}
		const weights = await this.loadWeights(category, key);
		weights[subKey] = value;
		await this.persistWeights(category, key, weights);
	}

	async adjustWeight(
		category: string,
		key: string,
		delta: number,
		subKey?: string,
	): Promise<void> {
		if (!subKey) {
			const current = await this.getWeight(category, key);
			const next = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current + delta));
			await this.setWeight(category, key, next);
			return;
		}
		const weights = await this.loadWeights(category, key);
		const current = weights[subKey] ?? DEFAULT_WEIGHT;
		weights[subKey] = Math.min(
			MAX_WEIGHT,
			Math.max(MIN_WEIGHT, current + delta),
		);
		await this.persistWeights(category, key, weights);
	}

	async applyFeedback(update: SystemWeightFeedbackUpdate): Promise<number> {
		let result = DEFAULT_WEIGHT;
		await this.enqueueWrite(async () => {
			const data = await this.backend.load();
			const correlationKey = update.correlationId
				? `weights:feedback:${update.category}:${update.key}:${update.subKey ?? ""}:${update.correlationId}`
				: undefined;
			if (correlationKey && data[correlationKey] === true) {
				result = await this.getWeight(
					update.category,
					update.key,
					update.subKey,
				);
				return;
			}

			const delta = boundedFeedbackDelta(update);
			const min = update.min ?? MIN_WEIGHT;
			const max = update.max ?? MAX_WEIGHT;
			if (update.subKey) {
				const weights = await this.loadWeights(update.category, update.key);
				result = clampWeight(
					(weights[update.subKey] ?? DEFAULT_WEIGHT) + delta,
					min,
					max,
				);
				weights[update.subKey] = result;
				await this.backend.set(
					this.storageKey(update.category, update.key),
					weights,
				);
			} else {
				const current = await this.getWeight(update.category, update.key);
				result = clampWeight(current + delta, min, max);
				await this.backend.set(
					this.storageKey(update.category, update.key),
					result,
				);
			}
			if (correlationKey) await this.backend.set(correlationKey, true);
			await this.backend.save();
		});
		return result;
	}

	async getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
		return this.loadWeights(category, key);
	}
}

export class SqlBackendSystemWeightStore implements SystemWeightStore {
	private readonly compiler: WeightQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;
	private readonly ready: Promise<void>;

	constructor(dialect: SqlDialect, executor: SqlExecutor, table = "weights") {
		this.compiler = new WeightQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddls = this.compiler.getTableDDL(this.table);
		for (const ddl of ddls) {
			await this.executor.exec(ddl.sql, ddl.params);
		}
	}

	async getWeight(
		category: string,
		key: string,
		subKey?: string,
	): Promise<number> {
		await this.ready;
		const { sql, params } = this.compiler.compileGetWeight(
			this.table,
			category,
			key,
			subKey,
		);
		const row = await this.executor.queryOne(sql, params);
		if (row && row.value !== undefined) {
			return row.value as number;
		}
		return DEFAULT_WEIGHT;
	}

	async setWeight(
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): Promise<void> {
		await this.ready;
		const { sql, params } = this.compiler.compileSetWeight(
			this.table,
			category,
			key,
			value,
			subKey,
		);
		await this.executor.exec(sql, params);
	}

	async adjustWeight(
		category: string,
		key: string,
		delta: number,
		subKey?: string,
	): Promise<void> {
		await this.ready;
		const current = await this.getWeight(category, key, subKey);
		const next = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current + delta));
		await this.setWeight(category, key, next, subKey);
	}

	async applyFeedback(update: SystemWeightFeedbackUpdate): Promise<number> {
		await this.ready;
		const subKey = update.subKey ?? "";
		if (update.correlationId) {
			const existing = this.compiler.compileGetFeedback(
				this.table,
				update.category,
				update.key,
				subKey,
				update.correlationId,
			);
			const row = await this.executor.queryOne(existing.sql, existing.params);
			if (row)
				return this.getWeight(update.category, update.key, update.subKey);
		}

		const delta = boundedFeedbackDelta(update);
		const min = update.min ?? MIN_WEIGHT;
		const max = update.max ?? MAX_WEIGHT;
		const current = await this.getWeight(
			update.category,
			update.key,
			update.subKey,
		);
		const result = clampWeight(current + delta, min, max);
		await this.setWeight(update.category, update.key, result, update.subKey);
		if (update.correlationId) {
			const marker = this.compiler.compileRecordFeedback(
				this.table,
				update.category,
				update.key,
				subKey,
				update.correlationId,
			);
			await this.executor.exec(marker.sql, marker.params);
		}
		return result;
	}

	async getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
		await this.ready;
		const { sql, params } = this.compiler.compileGetWeightsForCategory(
			this.table,
			category,
			key,
		);
		const rows = await this.executor.query(sql, params);
		const result: Record<string, number> = {};
		for (const row of rows) {
			const sk = row.sub_key as string;
			if (sk === "") continue;
			result[sk] = (row.value as number) ?? DEFAULT_WEIGHT;
		}
		return result;
	}
}
