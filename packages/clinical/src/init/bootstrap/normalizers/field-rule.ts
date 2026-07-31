import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";
import type { ConceptFieldRule } from "../../../store/interfaces";

export function normalizeFieldRule(
	record: ClinicalInitSeedLoadedRecord,
): ConceptFieldRule | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as ConceptFieldRule;
}
