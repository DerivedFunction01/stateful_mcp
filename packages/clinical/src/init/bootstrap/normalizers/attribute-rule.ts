import type { StoredAttributeRule } from "../../../store/parser/rules/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeAttributeRule(
	record: ClinicalInitSeedLoadedRecord,
): StoredAttributeRule | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as StoredAttributeRule;
}
