import type {
	ConceptSeed,
	DictionaryRecordType,
	DictionarySeed,
	DictionarySeedReport,
	ExpressionSeed,
	NamespaceSeed,
	RelationSeed,
	ResourceDiagnostic,
	SeedCount,
} from "./contracts";

export const recordTypes: readonly DictionaryRecordType[] = [
	"namespace",
	"concept",
	"relation",
	"expression",
];

export function emptySeedCount(): SeedCount {
	return { namespace: 0, concept: 0, relation: 0, expression: 0 };
}

export function createSeedReport(): DictionarySeedReport {
	return {
		inserted: emptySeedCount(),
		updated: emptySeedCount(),
		skipped: emptySeedCount(),
		diagnostics: [],
	};
}

export function seedRecords(seed: DictionarySeed): {
	namespaces: readonly NamespaceSeed[];
	concepts: readonly ConceptSeed[];
	relations: readonly RelationSeed[];
	expressions: readonly ExpressionSeed[];
} {
	return {
		namespaces: seed.namespaces ?? [],
		concepts: seed.concepts ?? [],
		relations: seed.relations ?? [],
		expressions: seed.expressions ?? [],
	};
}

export function addDiagnostic(
	diagnostics: ResourceDiagnostic[],
	diagnostic: ResourceDiagnostic,
): void {
	diagnostics.push({ severity: "error", ...diagnostic });
}

export function escapeSeedRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeLookupTerm(term: string): string {
	return term.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(
		([a], [b]) => a.localeCompare(b),
	);
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

export function sameRecord(left: unknown, right: unknown): boolean {
	return stableJson(left) === stableJson(right);
}
