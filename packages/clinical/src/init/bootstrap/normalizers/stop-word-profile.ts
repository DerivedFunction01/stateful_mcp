import type { StopWordProfile } from "../../../v2/stores/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeStopWordProfile(
	record: ClinicalInitSeedLoadedRecord,
): StopWordProfile | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as StopWordProfile;
}
