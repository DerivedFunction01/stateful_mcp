import type { Concept } from "@stateful-mcp/core/middleware/dictionary/types";
import type { ProseRenderContext } from "./template-types";

/** Session/render-scope cache for dictionary lookups used by prose projection. */
export class ProseRenderLookupCache {
	private readonly concepts = new Map<string, Promise<Concept | undefined>>();

	constructor(private readonly context: ProseRenderContext) {}

	getConcept(id: string): Promise<Concept | undefined> {
		const cached = this.concepts.get(id);
		if (cached) return cached;
		const lookup = Promise.resolve(this.context.dictionary?.getConcept(id));
		this.concepts.set(id, lookup);
		return lookup;
	}

	clear(): void {
		this.concepts.clear();
	}
}

export function createEnumDisplayResolver(
	maps: NonNullable<ProseRenderContext["enumMaps"]>,
): NonNullable<ProseRenderContext["displayEnum"]> {
	return (value, options = {}) => {
		const map = options.mapKey ? maps[options.mapKey] : undefined;
		const locale = options.locale ?? "en";
		const localized = map?.[locale] ?? map?.[locale.split("-")[0] ?? ""];
		const key = String(value);
		return localized?.[key] ?? `[unmapped:${key}]`;
	};
}
