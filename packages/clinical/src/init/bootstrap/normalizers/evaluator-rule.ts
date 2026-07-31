import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";
import type { ParserDictionaryRule } from "../../../store/interfaces";

export function normalizeEvaluatorRule(
	record: ClinicalInitSeedLoadedRecord,
): ParserDictionaryRule | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	return payload as unknown as ParserDictionaryRule;
}
