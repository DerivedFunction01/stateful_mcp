import type { RecipeEvaluation, RecipeOutputBuilder } from "../recipes";
import type { ChainedQuantityResult, QuantitySegment } from "./compile";

function evaluationValue(
	evaluation: RecipeEvaluation,
	slotId: string,
): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	return evaluation.slots[slotId]?.kind === "terminal"
		? evaluation.slots[slotId].value
		: undefined;
}

/** Builds a chained quantity from already-parsed authored amount/unit slots. */
export function createCompoundQuantityOutputBuilder(): RecipeOutputBuilder {
	return ({ evaluation, input, grammar, policy }) => {
		if (!grammar || evaluation.kind !== "fundamental") return { valid: false };
		const amountSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("NUM_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const unitSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("UNIT_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const packagingSlots = Object.keys(evaluation.slots)
			.filter((slotId) => slotId.startsWith("PKG_CLASSIFIER_"))
			.sort(
				(left, right) =>
					Number(left.split("_").at(-1)) - Number(right.split("_").at(-1)),
			);
		const segments: QuantitySegment[] = [];
		for (const [segmentIndex, amountSlot] of amountSlots.entries()) {
			const amount = evaluationValue(evaluation, amountSlot);
			const unit = evaluationValue(evaluation, unitSlots[segmentIndex] ?? "");
			const packaging = evaluationValue(
				evaluation,
				packagingSlots[segmentIndex] ?? "",
			);
			const resolvedUnit =
				typeof unit === "string"
					? unit
					: typeof packaging === "string"
						? packaging
						: undefined;
			if (typeof amount !== "number" || !resolvedUnit) return { valid: false };
			const canonical =
				grammar.quantity.conversionRegistry?.convertToCanonicalByUnit(
					resolvedUnit,
					amount,
				);
			segments.push({
				value: amount,
				unit: resolvedUnit,
				canonicalValue: canonical?.canonicalAmount ?? amount,
			});
		}
		if (segments.length < 2) return { valid: false };
		const first = segments[0]!;
		const target =
			policy?.quantityConsumerPolicy?.allowedUnits?.[0] ?? first.unit;
		const canonicalTotal = segments.reduce(
			(total, segment) => total + segment.canonicalValue,
			0,
		);
		const converted =
			grammar.quantity.conversionRegistry?.convertFromCanonicalByUnit(
				target,
				canonicalTotal,
			);
		const value: ChainedQuantityResult = {
			kind: "quantity",
			magnitude: converted ?? canonicalTotal,
			unit: target,
			dimension:
				grammar.quantity.conversionRegistry?.getUnit(first.unit)?.dimension ??
				"unknown",
			chain: segments,
			rawText: input.trim(),
		};
		return { valid: true, value, displayValue: input.trim() };
	};
}
