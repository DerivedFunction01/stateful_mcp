import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";
import type { ClinicalProseTemplate } from "../../../store/interfaces";

export function normalizeProseRule(
	record: ClinicalInitSeedLoadedRecord,
): ClinicalProseTemplate | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as ClinicalProseTemplate;
}
