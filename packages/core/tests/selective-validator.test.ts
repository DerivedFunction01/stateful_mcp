import { describe, expect, it } from "bun:test";
import { createRepo } from "../src/adapters/storage/shared/unified-repo";
import {
	type EvaluatorRule,
	type EvaluatorStore,
	type EvaluatorTrigger,
	type EventValidationResult,
	CompositeEvaluatorStore,
} from "../src/middleware/event/evaluator-types";
import { SelectiveValidatorRouter } from "../src/middleware/event/selective-validator-router";
import { EventStore } from "../src/middleware/event/store";
import type { EventMutation, EventRecord } from "../src/middleware/event/types";

describe("SelectiveValidatorRouter", () => {
	it("should filter by schema trigger", () => {
		const trigger: EvaluatorTrigger = { schemas: ["VitalsMeasurementEvent"] };
		const mutations: EventMutation[] = [
			{
				type: "add",
				event_id: "e1",
				data: { targetSchema: "VitalsMeasurementEvent", bp: 120 },
			},
		];
		expect(SelectiveValidatorRouter.shouldTrigger(trigger, mutations)).toBe(
			true,
		);

		const wrongMutations: EventMutation[] = [
			{
				type: "add",
				event_id: "e2",
				data: { targetSchema: "MedicationOrderObject" },
			},
		];
		expect(
			SelectiveValidatorRouter.shouldTrigger(trigger, wrongMutations),
		).toBe(false);
	});

	it("should filter by operation trigger", () => {
		const trigger: EvaluatorTrigger = { operations: ["update", "remove"] };
		const mutations: EventMutation[] = [{ type: "add", event_id: "e1" }];
		expect(SelectiveValidatorRouter.shouldTrigger(trigger, mutations)).toBe(
			false,
		);

		const patchMutations: EventMutation[] = [
			{ type: "update", event_id: "e1" },
		];
		expect(
			SelectiveValidatorRouter.shouldTrigger(trigger, patchMutations),
		).toBe(true);
	});

	it("should filter by modified fields trigger", () => {
		const trigger: EvaluatorTrigger = {
			modifiedFields: ["systolic", "diastolic"],
		};
		const mutations: EventMutation[] = [
			{ type: "update", event_id: "e1", data: { heartRate: 80 } },
		];
		expect(SelectiveValidatorRouter.shouldTrigger(trigger, mutations)).toBe(
			false,
		);

		const hitMutations: EventMutation[] = [
			{ type: "update", event_id: "e1", data: { systolic: 120 } },
		];
		expect(SelectiveValidatorRouter.shouldTrigger(trigger, hitMutations)).toBe(
			true,
		);
	});
});

describe("Selective Validation Integration inside EventStore", () => {
	const schemas = new Map<string, any>();
	schemas.set("vitals", {
		type: "object",
		properties: {
			systolic: { type: "number" },
		},
	});

	class MockVitalsEvaluatorRule implements EvaluatorRule {
		ruleId = "max-systolic-check";
		trigger: EvaluatorTrigger = {
			schemas: ["vitals"],
			operations: ["add", "update"],
			modifiedFields: ["systolic"],
		};

		async evaluate(
			projectedState: EventRecord[],
			mutations: EventMutation[],
		): Promise<EventValidationResult> {
			// Reject if any systolic reading in projected log > 300
			const invalid = projectedState.some((r) => (r as any).systolic > 300);
			if (invalid) {
				return {
					valid: false,
					errors: ["Systolic blood pressure cannot exceed 300 mmHg"],
				};
			}
			return { valid: true, errors: [] };
		}
	}

	class MockEvaluatorStore implements EvaluatorStore {
		async getRules(): Promise<EvaluatorRule[]> {
			return [new MockVitalsEvaluatorRule()];
		}
	}

	it("should reject append mutations violating validator rules, and accept valid ones", async () => {
		const adapter = await createRepo({
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});
		const eventStore = new EventStore(
			adapter.sessionEvent!,
			adapter.persistentEvent!,
			schemas,
			10,
			undefined,
			undefined,
			new MockEvaluatorStore(),
		);

		const sessionId = "session_valid_test";

		// Initialize vitals
		const baseCommit = await eventStore.init("vitals", sessionId, "base", [
			{ targetSchema: "vitals", systolic: 120 },
		]);

		// Append a valid systolic reading: should pass
		const tip1 = await eventStore.append(
			sessionId,
			"base",
			{ targetSchema: "vitals", systolic: 130 },
			"tip1",
		);
		expect(tip1).toBe("tip1");

		// Append an invalid systolic reading > 300: should throw OBJECT_VALIDATION_FAILED
		expect(
			eventStore.append(
				sessionId,
				"tip1",
				{ targetSchema: "vitals", systolic: 350 },
				"tip2",
			),
		).rejects.toThrow("Systolic blood pressure cannot exceed 300 mmHg");
	});

	it("should skip evaluation when trigger conditions do not match", async () => {
		const adapter = await createRepo({
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});
		const eventStore = new EventStore(
			adapter.sessionEvent!,
			adapter.persistentEvent!,
			schemas,
			10,
			undefined,
			undefined,
			new MockEvaluatorStore(),
		);

		const sessionId = "session_skip_test";
		await eventStore.init("vitals", sessionId, "base", [
			{ targetSchema: "vitals", systolic: 120 },
		]);

		// Append a different schema (or fields without systolic): should skip validation and succeed
		// even if we supply a dummy invalid field that isn't matched by trigger
		const tip1 = await eventStore.append(
			sessionId,
			"base",
			{ targetSchema: "other_schema", dummy: 999 },
			"tip1",
		);
		expect(tip1).toBe("tip1");
	});

	it("should support CompositeEvaluatorStore aggregating multiple stores", async () => {
		class MockMedicationEvaluatorRule implements EvaluatorRule {
			ruleId = "medication-limit-check";
			trigger: EvaluatorTrigger = {
				schemas: ["medication"],
				operations: ["add"],
			};

			async evaluate(
				projectedState: EventRecord[],
				mutations: EventMutation[],
			): Promise<EventValidationResult> {
				const invalid = projectedState.some((r) => (r as any).name === "RestrictedDrug");
				if (invalid) {
					return { valid: false, errors: ["RestrictedDrug is not allowed in this session"] };
				}
				return { valid: true, errors: [] };
			}
		}

		class MockMedicationStore implements EvaluatorStore {
			async getRules(): Promise<EvaluatorRule[]> {
				return [new MockMedicationEvaluatorRule()];
			}
		}

		const compositeStore = new CompositeEvaluatorStore([
			new MockEvaluatorStore(), // Vitals store (systolic BP check)
			new MockMedicationStore(), // Medication store (RestrictedDrug check)
		]);

		const adapter = await createRepo({
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});
		const eventStore = new EventStore(
			adapter.sessionEvent!,
			adapter.persistentEvent!,
			schemas,
			10,
			undefined,
			undefined,
			compositeStore,
		);

		const sessionId = "session_composite_test";
		await eventStore.init("vitals", sessionId, "base", [
			{ targetSchema: "vitals", systolic: 120 },
		]);

		// 1. Trigger vitals rule: should reject > 300
		expect(
			eventStore.append(
				sessionId,
				"base",
				{ targetSchema: "vitals", systolic: 320 },
				"tip1",
			),
		).rejects.toThrow("Systolic blood pressure cannot exceed 300 mmHg");

		// 2. Trigger medication rule: should reject RestrictedDrug
		expect(
			eventStore.append(
				sessionId,
				"base",
				{ targetSchema: "medication", name: "RestrictedDrug" },
				"tip2",
			),
		).rejects.toThrow("RestrictedDrug is not allowed in this session");

		// 3. Valid medication: should pass
		const tip3 = await eventStore.append(
			sessionId,
			"base",
			{ targetSchema: "medication", name: "Aspirin" },
			"tip3",
		);
		expect(tip3).toBe("tip3");
	});
});
