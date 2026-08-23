import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { MacroProjectManifest } from "@stateful-mcp/macro";
import { validateMacroProjectManifest } from "@stateful-mcp/macro-host";

/**
 * Returns true only when a directory contains a readable, structurally valid
 * Macro project manifest whose backend remains inside that directory.
 */
export async function isValidMacroProjectDirectory(
	directory: string,
): Promise<boolean> {
	const root = resolve(directory);
	try {
		const raw = await readFile(resolve(root, ".macro", "project.json"), "utf8");
		const manifest = JSON.parse(raw) as MacroProjectManifest;
		validateMacroProjectManifest(manifest);

		const backendPath = resolve(root, manifest.backend.path);
		const relativeBackendPath = relative(root, backendPath);
		return (
			relativeBackendPath === "" ||
			(!relativeBackendPath.startsWith("..") &&
				!isAbsolute(relativeBackendPath))
		);
	} catch {
		return false;
	}
}
