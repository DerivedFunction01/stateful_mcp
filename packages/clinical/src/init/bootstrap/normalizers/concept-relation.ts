import type { ConceptRelation } from "@stateful-mcp/core";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

const NAMESPACE_PREFIXES = ["RxNorm::", "SNOMED::", "LOINC::", "ICD10::"];
const RELATION_TYPES = new Set<ConceptRelation["relationshipType"]>([
	"EQUIVALENT",
	"NARROWER_THAN",
	"WIDER_THAN",
]);

export function normalizeConceptRelation(
	record: ClinicalInitSeedLoadedRecord,
): ConceptRelation | null {
	const payload = record.payload;
	const id = payload.id ?? record.recordId;
	const { conceptId, linkedId, relationshipType } = payload;
	if (typeof id !== "string" || id.length === 0) return null;
	if (typeof conceptId !== "string" || !hasNamespacePrefix(conceptId))
		return null;
	if (typeof linkedId !== "string" || !hasNamespacePrefix(linkedId))
		return null;
	if (
		typeof relationshipType !== "string" ||
		!RELATION_TYPES.has(relationshipType as ConceptRelation["relationshipType"])
	)
		return null;
	if (payload.active !== undefined && typeof payload.active !== "boolean")
		return null;

	return {
		id,
		conceptId,
		linkedId,
		relationshipType: relationshipType as ConceptRelation["relationshipType"],
		active: payload.active ?? true,
		designationDate:
			typeof payload.designationDate === "string"
				? payload.designationDate
				: undefined,
	};
}

function hasNamespacePrefix(value: string): boolean {
	return NAMESPACE_PREFIXES.some((prefix) => value.startsWith(prefix));
}
