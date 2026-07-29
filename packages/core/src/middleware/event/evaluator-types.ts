import type { EventMutation, EventRecord } from "./types";

export interface EventValidationResult {
	valid: boolean;
	errors: string[];
}

export interface EvaluatorTrigger {
	/** Match specific target schemas, e.g. ["MedicationOrderObject", "ObservationEvent"] */
	schemas?: string[];
	/** Match specific mutation operations, e.g. ["add", "update", "remove"] */
	operations?: ("add" | "update" | "remove")[];
	/** Match if specific fields are modified, e.g. ["medicationName", "value"] */
	modifiedFields?: string[];
}

export interface EvaluatorRule {
	ruleId: string;
	trigger: EvaluatorTrigger;
	evaluate(
		projectedState: EventRecord[],
		mutations: EventMutation[],
		sessionId: string,
	): Promise<EventValidationResult>;
}

export interface EvaluatorStore {
	getRules(schemaName: string): Promise<EvaluatorRule[]>;
}

export class CompositeEvaluatorStore implements EvaluatorStore {
	private stores: EvaluatorStore[];

	constructor(stores: EvaluatorStore[] = []) {
		this.stores = stores;
	}

	addStore(store: EvaluatorStore): void {
		this.stores.push(store);
	}

	async getRules(schemaName: string): Promise<EvaluatorRule[]> {
		const allRules: EvaluatorRule[] = [];
		for (const store of this.stores) {
			const rules = await store.getRules(schemaName);
			allRules.push(...rules);
		}
		return allRules;
	}
}
