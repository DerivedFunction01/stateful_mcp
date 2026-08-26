import type { CompiledAliasEntry } from "./contracts";

function isWordChar(char: string): boolean {
	return /[\p{L}\p{N}]/u.test(char);
}

export function spellingMatches(
	input: string,
	entry: CompiledAliasEntry,
): boolean {
	const a = entry.caseSensitive ? input : input.toLowerCase();
	const b = entry.caseSensitive ? entry.spelling : entry.spelling.toLowerCase();
	if (entry.boundary === "none") return a === b;
	let index = a.indexOf(b);
	while (index !== -1) {
		const before = index === 0 ? "" : a[index - 1]!;
		const after = index + b.length >= a.length ? "" : a[index + b.length]!;
		if (
			(before === "" || !isWordChar(before)) &&
			(after === "" || !isWordChar(after))
		)
			return true;
		index = a.indexOf(b, index + 1);
	}
	return false;
}
