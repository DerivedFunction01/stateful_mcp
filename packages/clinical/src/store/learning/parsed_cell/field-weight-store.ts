import type { KvBackend } from "@stateful-mcp/core";

const PREFIX = "field_weights:";
const DEFAULT_WEIGHT = 1.0;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 5.0;
const ADJUSTMENT_RATE = 0.1;

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

export class KvBackendFieldWeightStore implements FieldWeightStore {
	constructor(private backend: KvBackend) {}

	private schemaKey(targetSchema: string): string {
		return `${PREFIX}${targetSchema}`;
	}

	async loadSchemaWeights(
		targetSchema: string,
	): Promise<Record<string, number>> {
		const data = await this.backend.load();
		const raw = data[this.schemaKey(targetSchema)];
		if (raw && typeof raw === "object") {
			return raw as Record<string, number>;
		}
		return {};
	}

	async persistSchemaWeights(
		targetSchema: string,
		weights: Record<string, number>,
	): Promise<void> {
		await this.backend.set(this.schemaKey(targetSchema), weights);
		await this.backend.save();
	}

	async getWeight(targetSchema: string, field: string): Promise<number> {
		const weights = await this.loadSchemaWeights(targetSchema);
		return weights[field] ?? DEFAULT_WEIGHT;
	}

	async setWeight(
		targetSchema: string,
		field: string,
		weight: number,
	): Promise<void> {
		const weights = await this.loadSchemaWeights(targetSchema);
		weights[field] = weight;
		await this.persistSchemaWeights(targetSchema, weights);
	}

	async adjustWeight(
		targetSchema: string,
		field: string,
		delta: number,
	): Promise<void> {
		const weights = await this.loadSchemaWeights(targetSchema);
		const current = weights[field] ?? DEFAULT_WEIGHT;
		weights[field] = Math.min(
			MAX_WEIGHT,
			Math.max(MIN_WEIGHT, current + delta),
		);
		await this.persistSchemaWeights(targetSchema, weights);
	}

	async getWeightsForSchema(
		targetSchema: string,
	): Promise<Record<string, number>> {
		return this.loadSchemaWeights(targetSchema);
	}
}
