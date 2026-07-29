import type { KvBackend } from "@stateful-mcp/core";
import type { SystemWeightStore } from "../interfaces";

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

/** @deprecated Use SystemWeightStore instead */
export interface FieldWeightStore {
	getWeight(targetSchema: string, field: string): Promise<number>;
	setWeight(targetSchema: string, field: string, weight: number): Promise<void>;
	adjustWeight(
		targetSchema: string,
		field: string,
		delta: number,
	): Promise<void>;
	getWeightsForSchema(targetSchema: string): Promise<Record<string, number>>;
}

/** @deprecated Use KvBackendSystemWeightStore instead */
export class KvBackendFieldWeightStore implements FieldWeightStore {
	private store: KvBackendSystemWeightStore;
	constructor(backend: KvBackend) {
		this.store = new KvBackendSystemWeightStore(backend);
	}
	async getWeight(targetSchema: string, field: string): Promise<number> {
		return this.store.getWeight("field_weights", targetSchema, field);
	}
	async setWeight(
		targetSchema: string,
		field: string,
		weight: number,
	): Promise<void> {
		return this.store.setWeight("field_weights", targetSchema, weight, field);
	}
	async adjustWeight(
		targetSchema: string,
		field: string,
		delta: number,
	): Promise<void> {
		return this.store.adjustWeight("field_weights", targetSchema, delta, field);
	}
	async getWeightsForSchema(
		targetSchema: string,
	): Promise<Record<string, number>> {
		return this.store.getWeightsForCategory("field_weights", targetSchema);
	}
}
