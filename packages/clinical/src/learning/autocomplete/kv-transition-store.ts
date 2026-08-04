import type { KvBackend } from "@stateful-mcp/core";
import type {
	LearningObservationMode,
	MacroTransitionObservation,
	MacroTransitionQuery,
	MacroTransitionRecord,
	MacroTransitionStore,
	NumericFeatureStatistics,
} from "../interfaces";

const PREFIX = "macro-transition:";
const NUMERIC_PREFIX = "macro-transition:numeric:";
const CHECKPOINT_INTERVAL = 256;

interface NumericRecord extends MacroTransitionObservation {
	observationId: string;
	numericalValue: number;
	occurredAt: string;
}

export class KvMacroTransitionStore implements MacroTransitionStore {
	private data: Record<string, unknown> | null = null;
	private writeTail: Promise<void> = Promise.resolve();
	private writesSinceCheckpoint = 0;

	constructor(private readonly backend: KvBackend) {}

	private async ensureLoaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	private enqueueWrite(operation: () => Promise<void>): Promise<void> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	private key(observation: MacroTransitionObservation): string {
		return `${PREFIX}${this.encode([
			observation.macroId,
			observation.macroVersion,
			observation.fromSlot,
			observation.toSlot,
			observation.featureKey,
			observation.featureValue ?? "",
			observation.scope,
			observation.scopeKey,
			observation.observationMode,
		])}`;
	}

	private encode(parts: readonly unknown[]): string {
		return encodeURIComponent(JSON.stringify(parts));
	}

	private matches(
		record: MacroTransitionObservation,
		query: MacroTransitionQuery,
	): boolean {
		return (
			record.macroId === query.macroId &&
			record.macroVersion === query.macroVersion &&
			record.fromSlot === query.fromSlot &&
			record.scope === query.scope &&
			record.scopeKey === query.scopeKey &&
			(!query.observationModes?.length ||
				query.observationModes.includes(record.observationMode)) &&
			(query.featureKey === undefined ||
				record.featureKey === query.featureKey) &&
			(query.featureValue === undefined ||
				(query.featureValue === null
					? record.featureValue === null
					: record.featureValue === query.featureValue)) &&
			(!query.toSlots?.length || query.toSlots.includes(record.toSlot))
		);
	}

	async increment(observation: MacroTransitionObservation): Promise<void> {
		if (observation.outcome === "negative") return;
		await this.enqueueWrite(async () => {
			const data = await this.ensureLoaded();
			if (
				observation.observationId &&
				data[`${NUMERIC_PREFIX}${observation.observationId}`]
			)
				return;
			const now = observation.occurredAt ?? new Date().toISOString();
			const key = this.key(observation);
			const existing = data[key] as MacroTransitionRecord | undefined;
			const record: MacroTransitionRecord = existing
				? {
						...existing,
						transitionCount: existing.transitionCount + 1,
						lastUpdatedAt: now,
					}
				: {
						macroId: observation.macroId,
						macroVersion: observation.macroVersion,
						fromSlot: observation.fromSlot,
						toSlot: observation.toSlot,
						featureKey: observation.featureKey,
						featureValue: observation.featureValue,
						scope: observation.scope,
						scopeKey: observation.scopeKey,
						observationMode: observation.observationMode,
						transitionCount: 1,
						lastUpdatedAt: now,
					};
			data[key] = record;
			await this.backend.set(key, record);

			if (
				observation.numericalValue !== undefined &&
				observation.numericalValue !== null &&
				Number.isFinite(observation.numericalValue)
			) {
				const observationId = observation.observationId ?? crypto.randomUUID();
				const numericKey = `${NUMERIC_PREFIX}${observationId}`;
				if (!data[numericKey]) {
					const numeric: NumericRecord = {
						...observation,
						observationId,
						numericalValue: observation.numericalValue,
						occurredAt: now,
					};
					data[numericKey] = numeric;
					await this.backend.set(numericKey, numeric);
				}
			}
			this.writesSinceCheckpoint += 1;
			if (this.writesSinceCheckpoint >= CHECKPOINT_INTERVAL) {
				await this.backend.save();
				this.writesSinceCheckpoint = 0;
			}
		});
	}

	async getByFromSlot(
		query: MacroTransitionQuery,
	): Promise<MacroTransitionRecord[]> {
		const data = await this.ensureLoaded();
		return Object.values(data)
			.filter((value): value is MacroTransitionRecord => {
				const record = value as MacroTransitionRecord;
				return (
					typeof record?.transitionCount === "number" &&
					this.matches(record, query)
				);
			})
			.sort(
				(a, b) =>
					b.transitionCount - a.transitionCount ||
					a.toSlot.localeCompare(b.toSlot),
			);
	}

	async getNumericStatistics(
		query: MacroTransitionQuery,
	): Promise<Record<string, NumericFeatureStatistics>> {
		const data = await this.ensureLoaded();
		const grouped = new Map<string, NumericRecord[]>();
		for (const value of Object.values(data)) {
			const record = value as NumericRecord;
			if (
				!record?.observationId ||
				!Number.isFinite(record.numericalValue) ||
				!this.matches(record, query)
			)
				continue;
			const values = grouped.get(record.toSlot) ?? [];
			values.push(record);
			grouped.set(record.toSlot, values);
		}

		const result: Record<string, NumericFeatureStatistics> = {};
		for (const [toSlot, records] of grouped) {
			let mean = 0;
			let m2 = 0;
			let count = 0;
			let lastUpdatedAt: string | undefined;
			for (const record of records) {
				count += 1;
				const delta = record.numericalValue - mean;
				mean += delta / count;
				m2 += delta * (record.numericalValue - mean);
				if (!lastUpdatedAt || record.occurredAt > lastUpdatedAt)
					lastUpdatedAt = record.occurredAt;
			}
			result[toSlot] = {
				count,
				mean,
				standardDeviationPopulation: count
					? Math.sqrt(Math.max(0, m2 / count))
					: null,
				lastUpdatedAt,
			};
		}
		return result;
	}

	async reload(): Promise<void> {
		this.data = await this.backend.load();
	}
}

export type MacroTransitionMode = LearningObservationMode;
