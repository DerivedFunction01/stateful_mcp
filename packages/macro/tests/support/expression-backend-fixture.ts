import type {
	ExpressionBackend,
	ExpressionCandidate,
	ExpressionSearchRequest,
} from "../../src/contracts/backends";

export interface ExpressionFixtureRecord {
	id: string;
	term: string;
	canonicalValue: unknown;
	priority?: number;
	active?: boolean;
}

export function createExpressionBackendFixture(
	records: readonly ExpressionFixtureRecord[],
): ExpressionBackend {
	return {
		search(request: ExpressionSearchRequest): readonly ExpressionCandidate[] {
			const normalizedText = request.text.toLocaleLowerCase();
			const candidates: ExpressionCandidate[] = [];
			for (const record of records) {
				if (record.active === false) continue;
				const term = record.term.toLocaleLowerCase();
				let cursor = 0;
				while (cursor < normalizedText.length) {
					const exactStart = normalizedText.indexOf(term, cursor);
					if (exactStart >= 0) {
						const end = exactStart + term.length;
						const boundary = normalizedText[end] ?? "";
						if ((exactStart === 0 || /\s/u.test(normalizedText[exactStart - 1]!)) && (!boundary || /\s/u.test(boundary))) {
							candidates.push({
								id: record.id,
								term: request.text.slice(exactStart, end),
								start: exactStart,
								end,
								matchKind: "exact",
								priority: record.priority,
								canonicalValue: record.canonicalValue,
							});
						}
						cursor = end;
						continue;
					}
					break;
				}
				for (const start of boundaryStarts(normalizedText)) {
					const partial = normalizedText.slice(start);
					if (partial.length > 0 && partial.length < term.length && term.startsWith(partial)) {
						candidates.push({
							id: record.id,
							term: request.text.slice(start),
							start,
							end: normalizedText.length,
							matchKind: "prefix",
							priority: record.priority,
							canonicalValue: record.canonicalValue,
						});
					}
				}
			}
			return candidates;
		},
	};
}

function boundaryStarts(text: string): number[] {
	const starts = [0];
	for (let index = 1; index < text.length; index += 1) {
		if (/\s/u.test(text[index - 1]!)) starts.push(index);
	}
	return starts;
}
