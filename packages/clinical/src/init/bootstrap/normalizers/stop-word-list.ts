import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeStopWordList(
	record: ClinicalInitSeedLoadedRecord,
): string[] | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	const words = payload.words;
	if (!Array.isArray(words)) return null;
	return words;
}
