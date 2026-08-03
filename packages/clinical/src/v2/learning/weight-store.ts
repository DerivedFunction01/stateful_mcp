import type { KvBackend, SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { WeightQueryCompiler } from "../stores/sql/weight-query-compiler";
import type { SystemWeightStore } from "./interfaces";

const DEFAULT_WEIGHT = 1.0;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 5.0;

export class KvBackendSystemWeightStore implements SystemWeightStore {
	constructor(private backend: KvBackend) {}

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

	constructor(dialect: SqlDialect, executor: SqlExecutor, table = "weights") {
		this.compiler = new WeightQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
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
		const current = await this.getWeight(category, key, subKey);
		const next = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current + delta));
		await this.setWeight(category, key, next, subKey);
	}

	async getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
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
