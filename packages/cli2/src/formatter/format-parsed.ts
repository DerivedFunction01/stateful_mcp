/**
 * TODO(cli2-v2): replace this legacy ParsedItem formatter with
 * PresentationItem/ClinicalDocumentRenderer output. These functions are
 * retained as disabled presentation seams for copied UI callers only.
 */

export interface FormattedField {
	field: string;
	value: unknown;
	source?: string;
}

export interface FormattedParseResult {
	targetSchema: string;
	tag: string;
	rawInput: string;
	fields: FormattedField[];
	concepts: Array<{ id?: string; display: string }>;
	warnings: string[];
	errors: string[];
}

export function formatParsedItem(item: unknown): FormattedParseResult {
	void item;
	return {
		targetSchema: "v2-unavailable",
		tag: "",
		rawInput: "",
		fields: [],
		concepts: [],
		warnings: ["V1 ParsedItem presentation is disabled in cli2"],
		errors: [],
	};
}

export function formatParsedItems(items: unknown[]): FormattedParseResult[] {
	return items.map(formatParsedItem);
}

export function formatPreviewCandidate(
	candidate: unknown,
): FormattedParseResult[] {
	void candidate;
	return [];
}

export function printJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

export function printTree(results: FormattedParseResult[]): void {
	for (const r of results) {
		console.log(`--- ${r.targetSchema} (${r.tag}) ---`);
		console.log(`  raw: ${r.rawInput}`);
		for (const f of r.fields) {
			const src = f.source ? ` [${f.source}]` : "";
			console.log(`  ${f.field}${src}: ${JSON.stringify(f.value)}`);
		}
		for (const c of r.concepts) {
			console.log(`  concept: ${c.id ?? "?"} = ${c.display}`);
		}
		for (const w of r.warnings) console.log(`  ! ${w}`);
		for (const e of r.errors) console.log(`  ✗ ${e}`);
	}
}
