import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { LoadedExtension, UserMacroProfile } from "@stateful-mcp/macro";
import {
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	ExtensionError,
	ExtensionLoader as MacroExtensionLoader,
	type MacroWorkspace,
	mergeEditorKeymap,
	validateEditorKeymap,
} from "@stateful-mcp/macro";
import { registerCliLocales } from "./locales";

export interface WorkspaceExtensionSpec {
	readonly id: string;
	readonly source: string;
	readonly version: string;
}

export interface MacroWorkspaceManifest {
	readonly $schema?: string;
	readonly extensions: readonly WorkspaceExtensionSpec[];
}

export interface LoadedMacroCliWorkspace {
	readonly workspace: MacroWorkspace;
	readonly manifest?: MacroWorkspaceManifest;
	readonly manifestPath?: string;
	readonly profile?: UserMacroProfile;
	readonly keymap: EditorKeymapProfile;
	readonly loadedExtensions: readonly LoadedExtension[];
}

export interface LoadMacroCliOptions {
	readonly workspacePath?: string;
	readonly profilePath?: string;
	readonly keymapPath?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly inspect?: boolean;
	readonly inspectTarget?: string;
}

export async function loadMacroCliWorkspace(
	options: LoadMacroCliOptions = {},
): Promise<LoadedMacroCliWorkspace> {
	const manifestResult = options.workspacePath
		? await readWorkspaceManifest(options.workspacePath)
		: undefined;
	const profile = options.profilePath
		? await readJsonFile<UserMacroProfile>(options.profilePath)
		: undefined;
	const keymapOverride = options.keymapPath
		? await readJsonFile<Partial<EditorKeymapProfile>>(options.keymapPath)
		: undefined;
	const keymap = mergeEditorKeymap(
		DEFAULT_EDITOR_KEYMAP_PROFILE,
		keymapOverride,
	);
	const keymapDiagnostics = validateEditorKeymap(keymap, { allowSequencePrefixes: true });
	const keymapErrors = keymapDiagnostics.filter((diagnostic) => diagnostic.severity === "error");
	if (keymapErrors.length > 0) {
		throw new Error(`Invalid editor keymap: ${keymapErrors.map((diagnostic) => diagnostic.message).join("; ")}`);
	}

	const loadedExtensions = manifestResult
		? await loadManifestExtensions(manifestResult.manifest, manifestResult.path)
		: [];
	const workspace = createMacroWorkspace({
		initialText: options.initialText,
		initialLocale: options.locale ?? profile?.locale ?? "en",
		profile,
	});

	registerCliLocales(workspace.i18n);

	const activation = await workspace.runtime.activate(loadedExtensions);
	try {
		workspace.contributions.install(activation.active);
	} catch (error) {
		await workspace.dispose();
		throw error;
	}
	// The workspace parses once during construction, before extensions are active.
	// Re-project now so initial buffer content is immediately extension-aware.
	await workspace.scratchpad.parseAllLines();

	return {
		workspace,
		manifest: manifestResult?.manifest,
		manifestPath: manifestResult?.path,
		profile,
		keymap,
		loadedExtensions,
	};
}

export async function readWorkspaceManifest(
	manifestPath: string,
): Promise<{ manifest: MacroWorkspaceManifest; path: string }> {
	const path = resolve(manifestPath);
	const manifest = await readJsonFile<MacroWorkspaceManifest>(path);
	validateWorkspaceManifest(manifest);
	return { manifest, path };
}

export function validateWorkspaceManifest(
	manifest: MacroWorkspaceManifest,
): void {
	if (!manifest || !Array.isArray(manifest.extensions)) {
		throw new Error("Workspace manifest requires an extensions array");
	}
	const ids = new Set<string>();
	for (const entry of manifest.extensions) {
		if (!entry || !entry.id || !entry.source || !entry.version) {
			throw new Error(
				"Each workspace extension requires id, source, and version",
			);
		}
		if (ids.has(entry.id)) {
			throw new Error(`Duplicate workspace extension '${entry.id}'`);
		}
		ids.add(entry.id);
	}
}

async function loadManifestExtensions(
	manifest: MacroWorkspaceManifest,
	manifestPath: string,
): Promise<LoadedExtension[]> {
	validateWorkspaceManifest(manifest);
	const manifestDirectory = dirname(manifestPath);
	const files = manifest.extensions.map((entry) =>
		resolve(manifestDirectory, entry.source),
	);
	const listedPaths = new Set(files);
	for (const discovered of await discoverExtensionModules(
		resolve(manifestDirectory, "extensions"),
	)) {
		if (!listedPaths.has(discovered)) {
			throw new ExtensionError(
				`Extension module '${discovered}' is discovered but not listed in the workspace manifest`,
				"WORKSPACE_EXTENSION_UNLISTED",
				undefined,
				discovered,
			);
		}
	}
	const loaded = await new MacroExtensionLoader({
		directory: manifestDirectory,
	}).importFiles(files);
	const byId = new Map(manifest.extensions.map((entry) => [entry.id, entry]));
	for (const item of loaded) {
		const expected = byId.get(item.extension.manifest.id);
		if (!expected) {
			throw new ExtensionError(
				`Extension '${item.extension.manifest.id}' is not listed in the workspace manifest`,
				"WORKSPACE_EXTENSION_UNLISTED",
				item.extension.manifest.id,
				item.sourceFile,
			);
		}
		if (expected.version !== item.extension.manifest.version) {
			throw new ExtensionError(
				`Extension '${expected.id}' version mismatch: expected ${expected.version}, found ${item.extension.manifest.version}`,
				"WORKSPACE_EXTENSION_VERSION_MISMATCH",
				expected.id,
				item.sourceFile,
			);
		}
	}
	const listed = new Set(manifest.extensions.map((entry) => entry.id));
	for (const item of loaded) {
		for (const dependency of item.extension.manifest.requires ?? []) {
			if (!listed.has(dependency)) {
				throw new ExtensionError(
					`Extension '${item.extension.manifest.id}' requires unlisted dependency '${dependency}'`,
					"WORKSPACE_DEPENDENCY_UNLISTED",
					item.extension.manifest.id,
					item.sourceFile,
				);
			}
		}
	}
	return loaded;
}

async function discoverExtensionModules(directory: string): Promise<string[]> {
	const discovered: string[] = [];
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return [];
		throw error;
	}
	for (const entry of entries) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			discovered.push(...(await discoverExtensionModules(path)));
			continue;
		}
		if (!entry.isFile()) continue;
		if (
			/\.(?:ts|js|mjs)$/u.test(entry.name) &&
			(entry.name.startsWith("index.") || directory.endsWith("/extensions"))
		) {
			discovered.push(path);
		}
	}
	return discovered;
}

async function readJsonFile<T>(path: string): Promise<T> {
	const text = await readFile(resolve(path), "utf8");
	return JSON.parse(text) as T;
}
