import type { RecipeEvaluation, RecipeOutputBuilder } from "../recipes";
import type {
	QuantityGrammarConfig,
	QuantityGrammarResult,
	SingleQuantity,
} from "./contracts";
import { createSingleQuantity } from "./unit-alias";

function evaluationSlot(evaluation: RecipeEvaluation, slotId: string): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	return evaluation.slots[slotId]?.kind === "terminal"
		? evaluation.slots[slotId].value
		: undefined;
}

function firstEvaluationSlot(
	evaluation: RecipeEvaluation,
	name: string,
): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	const key = Object.keys(evaluation.slots).find((slotId) =>
		slotId.startsWith(`${name}_`),
	);
	return key ? evaluationSlot(evaluation, key) : undefined;
}

function quantityFromEvaluation(
	evaluation: RecipeEvaluation,
	config: QuantityGrammarConfig,
	rawText: string,
	amountSlot = "amount",
	unitSlot = "unit",
): SingleQuantity | undefined {
	const amount = evaluationSlot(evaluation, amountSlot);
	const unit = evaluationSlot(evaluation, unitSlot);
	if (typeof amount !== "number" || typeof unit !== "string") return undefined;
	return createSingleQuantity(amount, unit, config, rawText);
}

/** Output builders for authored quantity recipes. */
export function createQuantityOutputBuilders(): Readonly<
	Record<string, RecipeOutputBuilder>
> {
	return {
		"quantity.single": ({ evaluation, input, grammar, policy }) => {
			if (!grammar) return { valid: false };
			const quantity = quantityFromEvaluation(
				evaluation,
				grammar.quantity,
				input,
			);
			if (!quantity) return { valid: false };
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (
				quantityPolicy?.allowedUnits &&
				!quantityPolicy.allowedUnits.includes(quantity.unit)
			)
				return { valid: false };
			return {
				valid: true,
				value: { primaryQuantity: quantity, rawText: input.trim() },
				displayValue: input.trim(),
			};
		},
		"quantity.template": ({ evaluation, input, grammar, policy }) => {
			if (!grammar || evaluation.kind !== "fundamental")
				return { valid: false };
			const amount = firstEvaluationSlot(evaluation, "NUM");
			const explicitUnit = firstEvaluationSlot(evaluation, "UNIT");
			const packaging = firstEvaluationSlot(evaluation, "PKG_CLASSIFIER");
			const unit = explicitUnit ?? packaging;
			if (typeof amount !== "number" || typeof unit !== "string")
				return { valid: false };
			const quantity = createSingleQuantity(
				amount,
				unit,
				grammar.quantity,
				input,
			);
			if (!quantity) return { valid: false };
			const filler = firstEvaluationSlot(evaluation, "FILLER");
			const concept = firstEvaluationSlot(evaluation, "CONCEPT");
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (
				quantityPolicy?.allowedUnits &&
				!quantityPolicy.allowedUnits.includes(quantity.unit)
			)
				return { valid: false };
			const conceptValue =
				concept && typeof concept === "object" && "conceptId" in concept
					? (concept as {
							conceptId: string;
							term?: string;
							standardCode?: string;
							metadata?: Record<string, unknown>;
						})
					: undefined;
			const value: QuantityGrammarResult = {
				primaryQuantity: {
					...quantity,
					conceptDetails: conceptValue
						? {
								conceptTerm:
									conceptValue.term ?? String(conceptValue.conceptId),
								conceptId: conceptValue.conceptId,
								...(packaging ? { packagingUnit: String(packaging) } : {}),
								...(filler ? { fillerConnector: String(filler) } : {}),
								...(conceptValue.standardCode
									? { standardCode: conceptValue.standardCode }
									: {}),
								...(conceptValue.metadata
									? { metadata: conceptValue.metadata }
									: {}),
							}
						: undefined,
				},
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"quantity.range": ({ evaluation, input, grammar, policy }) => {
			if (!grammar || evaluation.kind !== "fundamental")
				return { valid: false };
			const start = evaluationSlot(evaluation, "start");
			const end = evaluationSlot(evaluation, "end");
			if (
				!start ||
				!end ||
				typeof start !== "object" ||
				typeof end !== "object" ||
				!("primaryQuantity" in start) ||
				!("primaryQuantity" in end)
			)
				return { valid: false };
			const startQuantity = (start as QuantityGrammarResult).primaryQuantity;
			const endQuantity = (end as QuantityGrammarResult).primaryQuantity;
			const quantityPolicy = policy?.quantityConsumerPolicy;
			if (quantityPolicy?.allowRange === false) return { valid: false };
			if (
				quantityPolicy?.allowedUnits &&
				(!quantityPolicy.allowedUnits.includes(startQuantity.unit) ||
					!quantityPolicy.allowedUnits.includes(endQuantity.unit))
			)
				return { valid: false };
			const direction =
				startQuantity.magnitude < endQuantity.magnitude
					? "ascending"
					: startQuantity.magnitude > endQuantity.magnitude
						? "descending"
						: "equal";
			if (
				direction === "descending" &&
				quantityPolicy?.allowDirectionalRange === false
			)
				return { valid: false };
			const value: QuantityGrammarResult = {
				primaryQuantity: startQuantity,
				range: {
					start: startQuantity,
					end: endQuantity,
					direction,
					rawText: input.trim(),
				},
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
	};
}
