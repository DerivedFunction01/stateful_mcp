import { evaluateCurrencyGrammar } from "../currency";
import { evaluateQuantityGrammar } from "../quantity";
import type {
	CompoundRateConfig,
	CompoundRateConsumerPolicy,
	CompoundRateNumerator,
} from "./types";

export function parseRateNumerator(
	segment: string,
	config: CompoundRateConfig,
	policy: CompoundRateConsumerPolicy,
): CompoundRateNumerator | undefined {
	const curRes = evaluateCurrencyGrammar(segment, config.currencyConfig ?? {});
	if (curRes.value) return { type: "currency", currency: curRes.value };
	const qtyRes = evaluateQuantityGrammar(
		segment,
		config.quantityConfig ?? {},
		policy.quantityPolicy ?? { allowRange: false },
	);
	if (qtyRes.value)
		return { type: "quantity", quantity: qtyRes.value.primaryQuantity };
	return undefined;
}
