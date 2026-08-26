import { evaluateQuantityGrammar, resolveUnitAlias } from "../quantity";
import type { CompoundRateConfig, CompoundRateDenominator } from "./types";

export function parseRateDenominator(
	segment: string,
	config: CompoundRateConfig,
): CompoundRateDenominator | undefined {
	let magnitude = 1;
	let unitStr = segment;
	const denQty = evaluateQuantityGrammar(segment, config.quantityConfig ?? {}, {
		allowRange: false,
	});
	if (denQty.value) {
		magnitude = denQty.value.primaryQuantity.magnitude;
		unitStr = denQty.value.primaryQuantity.unit;
	} else {
		const resolved = resolveUnitAlias(
			segment,
			config.quantityConfig?.unitAliases,
			config.locales,
		);
		unitStr = resolved?.canonicalUnit ?? segment;
	}
	return {
		unit: unitStr,
		magnitude,
		quantity: { magnitude, unit: unitStr, rawText: segment },
		rawText: segment,
	};
}
