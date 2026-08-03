import type { ParserDictionaryRule } from "../../../v2/stores/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeEvaluatorRule(
	record: ClinicalInitSeedLoadedRecord,
): ParserDictionaryRule | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as ParserDictionaryRule;
}
