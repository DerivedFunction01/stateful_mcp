const cache = new Map<string, RegExp>();

export function getCompiledRegex(pattern: string, flags = "u"): RegExp {
	const effectiveFlags =
		flags.includes("u") || flags.includes("v") ? flags : `${flags}u`;
	const key = `${pattern}\x00${effectiveFlags}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const compiled = new RegExp(pattern, effectiveFlags);
	cache.set(key, compiled);
	return compiled;
}

export function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type WordBoundaryMode = "none" | "unicode";

export function applyWordBoundary(
	pattern: string,
	mode: WordBoundaryMode = "unicode",
): string {
	if (mode === "none") return pattern;
	return `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;
}

export function execAll(expression: RegExp, text: string): RegExpExecArray[] {
	const results: RegExpExecArray[] = [];
	let match = expression.exec(text);
	while (match) {
		results.push(match);
		if (!match[0].length) expression.lastIndex += 1;
		match = expression.exec(text);
	}
	return results;
}
