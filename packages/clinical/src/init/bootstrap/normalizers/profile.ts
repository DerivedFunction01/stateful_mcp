import { UNIT_DISPLAY_MAP } from "../../../v2/schemas/schemas-interface/measurement";
import type { ParserSyntaxProfile } from "../../../v2/stores/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeProfile(
	record: ClinicalInitSeedLoadedRecord,
): ParserSyntaxProfile | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (!payload.profileId && !record.profileId) return null;
	const configuredQuantityDisplay = payload.quantityDisplay;
	const quantityDisplay =
		configuredQuantityDisplay && typeof configuredQuantityDisplay === "object"
			? configuredQuantityDisplay
			: {
					units: Object.fromEntries(
						Object.entries(UNIT_DISPLAY_MAP).map(([unit, display]) => [
							unit,
							{ short: display },
						]),
					),
				};
	return {
		...payload,
		profileId: payload.profileId ?? record.profileId,
		quantityDisplay,
	} as unknown as ParserSyntaxProfile;
}
