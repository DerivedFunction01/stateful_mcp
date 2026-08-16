import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { DictionarySeed } from "../resources/contracts";

export interface ExtensionSeedServices {
	load(path: string): Promise<DictionarySeed>;
}

export function createExtensionSeedServices(
	extensionRoot: string,
): ExtensionSeedServices {
	const root = resolve(extensionRoot);
	return {
		load: async (path) => {
			if (!path || isAbsolute(path)) {
				throw new Error("Seed paths must be non-empty and relative");
			}
			const resolved = resolve(root, path);
			const relativePath = relative(root, resolved);
			if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
				throw new Error(`Seed path escapes extension root: ${path}`);
			}
			const contents = await readFile(resolved, "utf8");
			const parsed: unknown = JSON.parse(contents);
			if (!isDictionarySeed(parsed)) {
				throw new Error(`Invalid dictionary seed: ${path}`);
			}
			return parsed;
		},
	};
}

function isDictionarySeed(value: unknown): value is DictionarySeed {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return ["namespaces", "concepts", "relations", "expressions"].every((key) => {
		const candidate = (value as Record<string, unknown>)[key];
		return candidate === undefined || Array.isArray(candidate);
	});
}
