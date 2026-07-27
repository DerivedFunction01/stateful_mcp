import type { ParsedMedicationItem } from "../../../../parser/schema-parsers";
import type { ParsedCellObservedShape } from "../../interfaces";

export function buildMedicationShape(
	item: ParsedMedicationItem,
): ParsedCellObservedShape {
	const slots: Record<string, any> = {};
	if (item.conceptId !== undefined) slots.conceptId = item.conceptId;
	if (item.route !== undefined) slots.route = item.route;
	if (item.frequency !== undefined)
		slots.frequency = serializeFrequency(item.frequency);
	if (item.dosage !== undefined) slots.dosage = JSON.stringify(item.dosage);
	if (item.quantityToDispense !== undefined)
		slots.quantityToDispense = String(item.quantityToDispense);
	if (item.authorizedRefills !== undefined)
		slots.authorizedRefills = String(item.authorizedRefills);
	if (item.genericSubstitutionPermitted !== undefined)
		slots.genericSubstitutionPermitted = String(
			item.genericSubstitutionPermitted,
		);
	if (item.targetIndication !== undefined)
		slots.targetIndication = item.targetIndication;

	return {
		schema: "MedicationOrderObject",
		slots,
	};
}

function serializeFrequency(freq: any): string {
	const parts: string[] = [freq.cadenceType];
	if (freq.interval) {
		parts.push(`${freq.interval.multiplier}${freq.interval.unit}`);
	}
	if (freq.rate) {
		parts.push(`/${freq.rate.times}/${freq.rate.period}`);
	}
	if (freq.eventAnchor) {
		parts.push(`@${freq.eventAnchor}`);
	}
	if (freq.isPrn) {
		parts.push(":prn");
	}
	if (freq.prnReason?.conceptId) {
		parts.push(`:${freq.prnReason.conceptId}`);
	}
	return parts.join(":");
}
