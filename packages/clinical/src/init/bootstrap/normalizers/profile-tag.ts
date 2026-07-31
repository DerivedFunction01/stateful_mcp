import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export interface NormalizedProfileTag {
	profileId: string;
	tagIds: string[];
}

export function normalizeProfileTag(
	record: ClinicalInitSeedLoadedRecord,
): NormalizedProfileTag | null {
	const payload = record.payload;
	if (!payload || typeof payload !== "object") return null;

	const profileId =
		typeof payload.profileId === "string"
			? payload.profileId
			: record.profileId;
	const tagIds = Array.isArray(payload.tagIds)
		? payload.tagIds.filter(
				(tagId): tagId is string => typeof tagId === "string",
			)
		: [];

	if (!profileId) return null;
	return { profileId, tagIds };
}
