import type { Personnel } from "../../../store/reference/personnel/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizePersonnel(
	record: ClinicalInitSeedLoadedRecord,
): Personnel | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.personnelId !== "string") return null;
	if (typeof payload.fullName !== "string") return null;
	if (typeof payload.specialtyCode !== "string") return null;
	if (typeof payload.facilityId !== "string") return null;
	return payload as unknown as Personnel;
}
