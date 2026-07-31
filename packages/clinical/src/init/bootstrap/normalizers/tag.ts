import type { TagRecord } from "../../../store/parser/tags/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeTag(
	record: ClinicalInitSeedLoadedRecord,
): TagRecord | null {
	const payload = record.payload;
	if (!payload || typeof payload !== "object") return null;

	const tagId = typeof payload.tagId === "string" ? payload.tagId : undefined;
	const tagName =
		typeof payload.tagName === "string" ? payload.tagName : undefined;
	if (!tagId || !tagName) return null;

	let tagBlob: string =
		typeof payload.tagBlob === "string"
			? payload.tagBlob
			: (JSON.stringify(payload.tagBlob ?? {}) ?? "{}");
	try {
		JSON.parse(tagBlob);
	} catch {
		tagBlob = "{}";
	}

	return {
		tagId,
		tagName,
		tagBlob,
		source: typeof payload.source === "string" ? payload.source : "seed",
	};
}
