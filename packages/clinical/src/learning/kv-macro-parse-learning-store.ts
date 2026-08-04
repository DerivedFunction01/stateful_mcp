import type { KvBackend } from "@stateful-mcp/core";
import type { HistoryPruningConfig } from "./command-history";
import type {
	MacroConfidenceResult,
	MacroParseFeedbackRecord,
	MacroParseLearningStore,
} from "./macro-parse-learning-store";

const EVENT_PREFIX = "macro-parse:event:";
const AGG_PREFIX = "macro-parse:aggregate:";
const CHECKPOINT_INTERVAL = 256;

export class KvMacroParseLearningStore implements MacroParseLearningStore {
	private data: Record<string, unknown> | null = null;
	private writeTail: Promise<void> = Promise.resolve();
	private writesSinceCheckpoint = 0;

	constructor(
		private readonly backend: KvBackend,
		private readonly pruningConfig?: HistoryPruningConfig,
	) {}

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

	async recordFeedback(feedback: Omit<MacroParseFeedbackRecord, "id" | "timestamp">): Promise<void> {
		await this.enqueueWrite(async () => {
			const data = await this.ensureLoaded();
			const id = crypto.randomUUID();
			const timestamp = new Date().toISOString();

			const event: MacroParseFeedbackRecord = {
				...feedback,
				id,
				timestamp,
			};

			// 1. Record event only
			const eventKey = `${EVENT_PREFIX}${id}`;
			data[eventKey] = event;
			await this.backend.set(eventKey, event);

			this.writesSinceCheckpoint += 1;

			// 2. Consolidation/pruning
			if (this.pruningConfig) {
				const events = Object.entries(data)
					.filter(([k]) => k.startsWith(EVENT_PREFIX))
					.map(([, v]) => v as MacroParseFeedbackRecord)
					.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

				if (events.length > this.pruningConfig.maxHistoryRows) {
					const toPrune = events.slice(0, this.pruningConfig.pruneBatchSize);
					for (const p of toPrune) {
						// Shift to aggregate
						const aggKey = `${AGG_PREFIX}${p.macroId}:${p.argumentName}:${p.rawTerm}:${p.parsedValue}`;
						const existing = (data[aggKey] as any) ?? {
							acceptedCount: 0,
							correctedCount: 0,
							rejectedCount: 0,
							lastUpdatedAt: p.timestamp,
						};
						if (p.outcome === "accepted") existing.acceptedCount += 1;
						if (p.outcome === "corrected") existing.correctedCount += 1;
						if (p.outcome === "rejected") existing.rejectedCount += 1;
						existing.lastUpdatedAt = p.timestamp;

						data[aggKey] = existing;
						await this.backend.set(aggKey, existing);

						const pKey = `${EVENT_PREFIX}${p.id}`;
						delete data[pKey];
						await this.backend.delete(pKey);
						this.writesSinceCheckpoint += 2;
					}
				}
			}

			if (this.writesSinceCheckpoint >= CHECKPOINT_INTERVAL) {
				await this.backend.save();
				this.writesSinceCheckpoint = 0;
			}
		});
	}

	async getConfidence(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string
	): Promise<MacroConfidenceResult> {
		const data = await this.ensureLoaded();
		
		let accepted = 0;
		let corrected = 0;
		let rejected = 0;

		// 1. Get from Aggregate table
		const aggKey = `${AGG_PREFIX}${macroId}:${argumentName}:${rawTerm}:${parsedValue}`;
		const agg = data[aggKey] as any;
		if (agg) {
			accepted += Number(agg.acceptedCount ?? 0);
			corrected += Number(agg.correctedCount ?? 0);
			rejected += Number(agg.rejectedCount ?? 0);
		}

		// 2. Get from remaining active events in memory
		for (const [k, v] of Object.entries(data)) {
			if (!k.startsWith(EVENT_PREFIX)) continue;
			const ev = v as MacroParseFeedbackRecord;
			if (
				ev.macroId === macroId &&
				ev.argumentName === argumentName &&
				ev.rawTerm === rawTerm &&
				ev.parsedValue === parsedValue
			) {
				if (ev.outcome === "accepted") accepted += 1;
				if (ev.outcome === "corrected") corrected += 1;
				if (ev.outcome === "rejected") rejected += 1;
			}
		}

		const total = accepted + corrected + rejected;
		if (total === 0) {
			return { score: 0.5, sampleSize: 0 };
		}

		const score = (accepted + 1) / (total + 2);
		return { score, sampleSize: total };
	}
}
