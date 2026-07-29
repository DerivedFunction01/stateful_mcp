import type { KvBackend } from "@stateful-mcp/core";
import type {
	AutocompleteTransitionContinuousAggregatePlan,
	AutocompleteTransitionDecayedAggregatePlan,
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionKey,
	AutocompleteTransitionRecord,
	AutocompleteTransitionStore,
} from "../interfaces";

const STORE_PREFIX = "autocomplete_transition:";

export class KvAutocompleteTransitionStore
	implements AutocompleteTransitionStore
{
	constructor(private backend: KvBackend) {}

	async increment(plan: AutocompleteTransitionInsertPlan): Promise<void> {
		const key = this.buildKey(plan);
		const data = await this.backend.load();
		const existing = data[key] as AutocompleteTransitionRecord | undefined;
		const now = plan.lastUpdatedAt;

		if (existing) {
			existing.selectionCount += plan.selectionCount;
			existing.lastUpdatedAt = now;
			await this.backend.set(key, existing);
		} else {
			await this.backend.set(key, {
				personnelId: plan.personnelId,
				templateId: plan.templateId,
				fromSlot: plan.fromSlot,
				toSlot: plan.toSlot,
				featureKey: plan.featureKey,
				featureValue: plan.featureValue,
				numericalValue: plan.numericalValue,
				selectionCount: plan.selectionCount,
				lastUpdatedAt: now,
			});
		}

		await this.backend.save();
	}

	async getByFromSlot(
		key: AutocompleteTransitionKey,
	): Promise<AutocompleteTransitionRecord[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.filter((v): v is AutocompleteTransitionRecord => {
				const r = v as AutocompleteTransitionRecord;
				return (
					r != null &&
					r.personnelId === key.personnelId &&
					r.templateId === key.templateId &&
					r.fromSlot === key.fromSlot
				);
			})
			.sort(
				(a, b) =>
					new Date(b.lastUpdatedAt).getTime() -
					new Date(a.lastUpdatedAt).getTime(),
			);
	}

	async getDecayedAggregate(
		plan: AutocompleteTransitionDecayedAggregatePlan,
	): Promise<Record<string, number>> {
		const data = await this.backend.load();
		const halfLifeSecs = plan.halfLifeDays * 86400;

		let maxT = 0;
		for (const v of Object.values(data)) {
			const r = v as AutocompleteTransitionRecord;
			if (
				r != null &&
				r.personnelId === plan.personnelId &&
				r.templateId === plan.templateId
			) {
				const t = new Date(r.lastUpdatedAt).getTime();
				if (t > maxT) maxT = t;
			}
		}
		if (maxT === 0) return {};

		const result: Record<string, number> = {};
		for (const v of Object.values(data)) {
			const r = v as AutocompleteTransitionRecord;
			if (
				r == null ||
				r.personnelId !== plan.personnelId ||
				r.templateId !== plan.templateId ||
				r.fromSlot !== plan.fromSlot
			) {
				continue;
			}

			const lastT = new Date(r.lastUpdatedAt).getTime();
			const deltaSec = (maxT - lastT) / 1000;
			const decay = 0.5 ** (deltaSec / halfLifeSecs);
			const decayed = (r.selectionCount || 0) * decay;
			result[r.toSlot] = (result[r.toSlot] || 0) + decayed;
		}
		return result;
	}

	async getContinuousAggregate(
		plan: AutocompleteTransitionContinuousAggregatePlan,
	): Promise<Record<string, { mu: number; sigmaSq: number }>> {
		const data = await this.backend.load();
		const buckets: Record<string, number[]> = {};

		for (const v of Object.values(data)) {
			const r = v as AutocompleteTransitionRecord;
			if (
				r != null &&
				r.personnelId === plan.personnelId &&
				r.templateId === plan.templateId &&
				r.fromSlot === plan.fromSlot &&
				r.featureKey === plan.featureKey &&
				r.numericalValue != null
			) {
				if (!buckets[r.toSlot]) {
					buckets[r.toSlot] = [];
				}
				buckets[r.toSlot]!.push(r.numericalValue);
			}
		}

		const result: Record<string, { mu: number; sigmaSq: number }> = {};
		for (const [toSlot, values] of Object.entries(buckets)) {
			const n = values.length;
			const mu = values.reduce((sum, v) => sum + v, 0) / n;
			const sigmaSq =
				n > 1 ? values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (n - 1) : 0;
			result[toSlot] = { mu, sigmaSq };
		}
		return result;
	}

	private buildKey(plan: AutocompleteTransitionInsertPlan): string {
		return `${STORE_PREFIX}${plan.personnelId}:${plan.templateId}:${plan.fromSlot}:${plan.toSlot}:${plan.featureKey}`;
	}
}
