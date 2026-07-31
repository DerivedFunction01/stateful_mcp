import type { ParserConceptDefault } from "../../../store/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeConceptDefault(
	record: ClinicalInitSeedLoadedRecord,
): ParserConceptDefault | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as ParserConceptDefault;
}
