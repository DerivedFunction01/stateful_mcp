import type { ParsedVitalsItem } from "../../../../parser/schema-parsers";
import type { ParsedCellObservedShape } from "../../interfaces";

export function buildVitalsShape(
	item: ParsedVitalsItem,
): ParsedCellObservedShape {
	const slots: Record<string, any> = {};
	if (item.conceptId !== undefined) slots.conceptId = item.conceptId;
	if (item.value !== undefined) slots.value = String(item.value);
	if (item.unit !== undefined) slots.unit = item.unit;
	if (item.unitAnchor !== undefined) slots.unitAnchor = item.unitAnchor;

	return {
		schema: "VitalsMeasurementEvent",
		slots,
	};
}
