import type { ProseTemplate } from "../../../store/reference/prose-parser-templates/prose-template";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeProseParserTemplate(
	record: ClinicalInitSeedLoadedRecord,
): ProseTemplate | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.templateId !== "string") return null;
	if (typeof payload.targetSchema !== "string") return null;
	if (typeof payload.sectionPattern !== "string") return null;
	if (!Array.isArray(payload.slots)) return null;
	return payload as unknown as ProseTemplate;
}
