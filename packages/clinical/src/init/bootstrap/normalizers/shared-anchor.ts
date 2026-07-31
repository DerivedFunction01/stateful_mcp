import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";
import type { SharedFieldAnchorRule } from "../../../parser/field-shared/shared-field-anchor";

export function normalizeSharedAnchor(
	record: ClinicalInitSeedLoadedRecord,
): SharedFieldAnchorRule | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as SharedFieldAnchorRule;
}
