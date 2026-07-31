import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";
import type { StopWordProfile } from "../../../store/interfaces";

export function normalizeStopWordProfile(
	record: ClinicalInitSeedLoadedRecord,
): StopWordProfile | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as StopWordProfile;
}
