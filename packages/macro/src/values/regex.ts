const cache = new Map<string, RegExp>();

export function getCompiledRegex(pattern: string, flags = ""): RegExp {
	const key = `${pattern}\x00${flags}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const compiled = new RegExp(pattern, flags);
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
