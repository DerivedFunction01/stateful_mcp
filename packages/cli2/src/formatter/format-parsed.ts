import type { ParsedItem } from "@stateful-mcp/clinical/parser/schema-parsers";
import type { PreviewCandidate } from "@stateful-mcp/clinical/session/preview-candidate";

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

export function formatParsedItem(item: ParsedItem): FormattedParseResult {
	const fields: FormattedField[] = [];
	for (const [key, value] of Object.entries(item.extractedData ?? {})) {
		fields.push({ field: key, value });
	}
	if (item.attributes) {
		for (const [key, value] of Object.entries(item.attributes)) {
			fields.push({ field: `attr.${key}`, value, source: "attribute" });
		}
	}

	return {
		targetSchema: item.targetSchema,
		tag: item.tag,
		rawInput: item.rawText,
		fields,
		concepts: item.concept.map((c) => ({
			id: c.conceptId,
			display: c.display,
		})),
		warnings: [],
		errors: [],
	};
}

export function formatParsedItems(items: ParsedItem[]): FormattedParseResult[] {
	return items.map(formatParsedItem);
}

export function formatPreviewCandidate(
	candidate: PreviewCandidate,
): FormattedParseResult[] {
	if (!candidate.parsedOutput) return [];
	return formatParsedItems(candidate.parsedOutput);
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
