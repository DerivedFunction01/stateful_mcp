const cache = new Map<string, RegExp>();

export function getCompiledRegex(pattern: string, flags = ""): RegExp {
	const key = `${pattern}\x00${flags}`;
	let r = cache.get(key);
	if (!r) {
		r = new RegExp(pattern, flags);
		cache.set(key, r);
	}
	return r;
}
