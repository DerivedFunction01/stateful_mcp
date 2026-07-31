import type { Facility } from "../../../store/reference/facilities/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeFacility(
	record: ClinicalInitSeedLoadedRecord,
): Facility | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.facilityId !== "string") return null;
	if (typeof payload.facilityCode !== "string") return null;
	if (typeof payload.facilityName !== "string") return null;
	if (typeof payload.jurisdictionCode !== "string") return null;
	return payload as unknown as Facility;
}
