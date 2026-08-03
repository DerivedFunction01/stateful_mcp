import type { JurisdictionalDisplay } from "../../../v2/stores/jurisdictional-displays/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeJurisdictionalDisplay(
	record: ClinicalInitSeedLoadedRecord,
): JurisdictionalDisplay | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.conceptId !== "string") return null;
	if (typeof payload.jurisdictionId !== "string") return null;
	if (typeof payload.preferredDisplay !== "string") return null;
	if (typeof payload.fullySpecifiedName !== "string") return null;
	if (typeof payload.source !== "string") return null;
	return payload as unknown as JurisdictionalDisplay;
}
