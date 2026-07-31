import type { ParserSyntaxProfile } from "../../../store/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeProfile(
	record: ClinicalInitSeedLoadedRecord,
): ParserSyntaxProfile | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (!payload.profileId && !record.profileId) return null;
	return payload as unknown as ParserSyntaxProfile;
}
