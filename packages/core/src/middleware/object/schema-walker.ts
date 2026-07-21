export function validateCycleFree(defs: Record<string, unknown>): void {
	const visited = new Set<string>();
	const stack = new Set<string>();

	function dfs(name: string): void {
		if (stack.has(name))
			throw new Error(`Object schema cycle detected: ... → ${name}`);
		if (visited.has(name)) return;
		visited.add(name);
		stack.add(name);

		const def = defs[name] as any;
		if (def?.properties) {
			for (const prop of Object.values<any>(def.properties)) {
				const ref: string | undefined = prop?.$ref;
				if (ref?.startsWith("#/$defs/")) {
					dfs(ref.replace("#/$defs/", ""));
				}
			}
		}
		stack.delete(name);
	}

	for (const name of Object.keys(defs)) {
		if (!visited.has(name)) dfs(name);
	}
}

export function validateFieldLimits(
	defs: Record<string, unknown>,
	maxFields: number,
	maxDepth: number,
): void {
	function check(defName: string, depth: number): void {
		if (depth > maxDepth)
			throw new Error(
				`Object schema: nesting depth exceeds ${maxDepth} at "${defName}"`,
			);
		const def = defs[defName] as any;
		const props = def?.properties ? Object.keys(def.properties) : [];
		if (props.length > maxFields) {
			throw new Error(
				`Object schema: "${defName}" has ${props.length} fields, exceeds max ${maxFields}`,
			);
		}
		for (const prop of Object.values<any>(def?.properties ?? {})) {
			if (prop?.$ref?.startsWith("#/$defs/")) {
				check(prop.$ref.replace("#/$defs/", ""), depth + 1);
			}
		}
	}
	for (const name of Object.keys(defs)) check(name, 1);
}

// Walk schema to resolve what type a given path points to
export function resolvePathSchema(
	rootSchema: any,
	defs: Record<string, any>,
	path: (string | number)[],
): any {
	let current = rootSchema;
	for (const segment of path) {
		if (typeof segment === "number") {
			current = current?.items;
		} else {
			if (current?.$ref?.startsWith("#/$defs/")) {
				current = defs[current.$ref.replace("#/$defs/", "")];
			}
			current = current?.properties?.[segment];
		}
		if (!current) return null;
	}
	return current;
}
