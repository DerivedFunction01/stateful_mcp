import type { MacroDefinition } from "./macro-definition";
import type { DocumentPlacementRef } from "./macro-plan";

export interface MacroPlacementSelection {
	placement?: DocumentPlacementRef;
	diagnostics: string[];
}

export function selectMacroPlacement(
	definition: MacroDefinition,
	placements: readonly DocumentPlacementRef[],
	requestedPlacementId?: string,
): MacroPlacementSelection {
	if (!definition.placementPolicy)
		return { placement: placements[0], diagnostics: [] };
	const placementId =
		requestedPlacementId ?? definition.placementPolicy.defaultPlacementId;
	if (!placementId)
		return {
			diagnostics: [`Macro '${definition.macroId}' requires a document placement`],
		};
	if (!definition.placementPolicy.allowedPlacementIds.includes(placementId))
		return {
			diagnostics: [`Placement '${placementId}' is not allowed for macro '${definition.macroId}'`],
		};
	const placement = placements.find((candidate) => candidate.placementId === placementId);
	if (!placement)
		return { diagnostics: [`Placement '${placementId}' is not available`] };
	return { placement, diagnostics: [] };
}
