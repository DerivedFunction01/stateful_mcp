import type { ParserMacro, ParserMacroStore } from "../store/interfaces";

export class InMemoryParserMacroStore implements ParserMacroStore {
	private readonly macros = new Map<string, ParserMacro>();

	async get(macroName: string): Promise<ParserMacro | null> {
		return this.macros.get(macroName) ?? null;
	}

	async list(): Promise<ParserMacro[]> {
		return Array.from(this.macros.values());
	}

	async set(macro: ParserMacro): Promise<void> {
		this.macros.set(macro.macroName, macro);
	}

	async delete(macroId: string): Promise<void> {
		for (const [name, m] of this.macros.entries()) {
			if (m.macroId === macroId) {
				this.macros.delete(name);
				break;
			}
		}
	}
}

export class MacroExpander {
	/**
	 * Pre-processes the input text by scanning and recursively expanding macro tokens.
	 * e.g. ^severe_sob(8, 2) -> "shortness of breath; 8/10; progressive; 2 hours"
	 */
	static async expand(
		text: string,
		macroStore: ParserMacroStore,
		profile: {
			macroStartToken: string;
			macroArgStartToken?: string;
			macroArgEndToken?: string;
			macroArgDelimiter?: string;
		},
		maxDepth = 10,
	): Promise<string> {
		const macroStartToken = profile.macroStartToken || "^";
		const startTok = profile.macroArgStartToken ?? "(";
		const endTok = profile.macroArgEndToken ?? ")";
		const delim = profile.macroArgDelimiter ?? ",";

		const escToken = macroStartToken.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
		const escStart = startTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
		const escEnd = endTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

		const argsPattern = escEnd
			? `${escStart}([^${escEnd}]*)${escEnd}`
			: `${escStart}([^\\s]*)`;
		const macroRegex = new RegExp(
			`${escToken}([a-zA-Z0-9_-]+)(?:${argsPattern})?`,
			"g",
		);

		let currentText = text;
		let depth = 0;
		let expanded = true;

		while (expanded && depth < maxDepth) {
			expanded = false;
			const matches = Array.from(currentText.matchAll(macroRegex));
			if (matches.length === 0) break;

			// Fetch definitions first
			const macroMap = new Map<string, string>();
			for (const match of matches) {
				const name = match[1];
				if (name && !macroMap.has(name)) {
					const macro = await macroStore.get(name);
					if (macro) {
						macroMap.set(name, macro.macroTemplate);
					}
				}
			}

			if (macroMap.size === 0) break;

			// Replace all instances
			currentText = currentText.replace(
				macroRegex,
				(match, name, argsString) => {
					const template = macroMap.get(name);
					if (template === undefined) return match;

					expanded = true;
					if (!argsString) return template;

					const args = argsString.split(delim).map((arg: string) => arg.trim());
					let result = template;
					for (let i = 0; i < args.length; i++) {
						const placeholder = `$${i + 1}`;
						result = result.split(placeholder).join(args[i]);
					}
					return result;
				},
			);

			depth++;
		}

		if (depth >= maxDepth) {
			throw new Error(
				`Infinite recursion/depth limit reached during macro expansion: exceeded ${maxDepth} rounds`,
			);
		}

		return currentText;
	}
}
