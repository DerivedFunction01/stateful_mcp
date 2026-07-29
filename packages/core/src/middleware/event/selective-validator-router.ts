import type { EvaluatorTrigger } from "./evaluator-types";
import type { EventMutation } from "./types";

export class SelectiveValidatorRouter {
	static shouldTrigger(
		trigger: EvaluatorTrigger,
		mutations: EventMutation[],
	): boolean {
		// 1. Check Schema matching
		if (trigger.schemas && trigger.schemas.length > 0) {
			const hasSchemaMatch = mutations.some((m) => {
				const target = (m.data as any)?.targetSchema || (m.data as any)?.type;
				return target && trigger.schemas!.includes(target);
			});
			if (!hasSchemaMatch) return false;
		}

		// 2. Check Operation matching
		if (trigger.operations && trigger.operations.length > 0) {
			const hasOpMatch = mutations.some((m) =>
				trigger.operations!.includes(m.type),
			);
			if (!hasOpMatch) return false;
		}

		// 3. Check Modified Fields matching
		if (trigger.modifiedFields && trigger.modifiedFields.length > 0) {
			const hasFieldMatch = mutations.some((m) => {
				if (!m.data) return false;
				const keys = Object.keys(m.data);
				return trigger.modifiedFields!.some((field) => keys.includes(field));
			});
			if (!hasFieldMatch) return false;
		}

		return true;
	}
}
