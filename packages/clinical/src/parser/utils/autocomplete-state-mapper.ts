import type { ParsedItem } from "../schema-parsers";
import type { ProseTemplate } from "../../store/reference/prose-parser-templates/prose-template";

export class AutocompleteSessionStateMapper {
	/**
	 * Maps fully parsed items back into a key-value record corresponding to slotNames
	 * and their extracted values, to feed the SuggestionContext filledSlots map.
	 */
	static mapParsedItemsToSlots(
		parsedItems: ParsedItem[],
		template: ProseTemplate,
	): Record<string, any> {
		const filledSlots: Record<string, any> = {};

		for (const slot of template.slots) {
			// Find the parsed item matching targetSchema
			const matchedItem = parsedItems.find(
				(item) => item.targetSchema === slot.targetSchema,
			);
			if (!matchedItem) continue;

			// If fieldPath is specified, extract value from item.extractedData
			if (slot.fieldPath) {
				const value = slot.fieldPath === "concept" 
					? (matchedItem.concept?.[0]?.display ?? matchedItem.extractedData[slot.fieldPath])
					: matchedItem.extractedData[slot.fieldPath];
				if (value !== undefined && value !== null) {
					filledSlots[slot.slotName] = value;
				}
			} else {
				// Fallback to concept display or exact extracted payload representation
				const conceptDisplay = matchedItem.concept?.[0]?.display;
				if (conceptDisplay) {
					filledSlots[slot.slotName] = conceptDisplay;
				} else if (matchedItem.extractedData) {
					filledSlots[slot.slotName] = matchedItem.extractedData;
				}
			}
		}

		return filledSlots;
	}
}
