import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { JsonlKvBackend, MemoryKvBackend } from "@stateful-mcp/core";
import type { LoadedExtension, UserMacroProfile } from "@stateful-mcp/macro";
import {
	CoreKvSettingsStorageDriver,
	createDefaultI18nKernel,
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	ExtensionError,
	ExtensionLoader as MacroExtensionLoader,
	type MacroWorkspace,
	mergeEditorKeymap,
	resolveProfile,
	validateEditorKeymap,
	WorkspaceSettingsService,
} from "@stateful-mcp/macro";
import { createElement } from "react";
import { BuiltinActivityPanel } from "./components/BuiltinActivityPanel";
import { createSettingsTabProvider } from "./components/SettingsWindow";
import {
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
} from "./config/default-settings";
import { registerCliLocales } from "./locales";

export interface WorkspaceExtensionSpec {
	readonly id: string;
	readonly source: string;
	readonly version: string;
	readonly requires?: readonly string[];
}

export interface MacroWorkspaceManifest {
	readonly $schema?: string;
	readonly extensions: readonly WorkspaceExtensionSpec[];
	readonly profiles?: Readonly<Record<string, readonly string[]>>;
	readonly activeProfile?: string;
}

export interface LoadedMacroCliWorkspace {
	readonly workspace: MacroWorkspace;
	readonly manifest?: MacroWorkspaceManifest;
	readonly manifestPath?: string;
	readonly profile?: UserMacroProfile;
	readonly keymap: EditorKeymapProfile;
	readonly loadedExtensions: readonly LoadedExtension[];
	readonly activeProfile?: string;
	readonly resolvedExtensionIds: readonly string[];
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
		? await readJsonFile<UserMacroProfile>(options.profilePath).catch(
				() => undefined,
			)
		: undefined;
	const keymapOverride = options.keymapPath
		? await readJsonFile<Partial<EditorKeymapProfile>>(options.keymapPath)
		: undefined;
	const keymap = mergeEditorKeymap(
		DEFAULT_EDITOR_KEYMAP_PROFILE,
		keymapOverride,
	);
	const keymapDiagnostics = validateEditorKeymap(keymap, {
		allowSequencePrefixes: true,
	});
	const keymapErrors = keymapDiagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	);
	if (keymapErrors.length > 0) {
		throw new Error(
			`Invalid editor keymap: ${keymapErrors.map((diagnostic) => diagnostic.message).join("; ")}`,
		);
	}

	const resolved = manifestResult
		? resolveWorkspaceExtensions(manifestResult.manifest)
		: { extensions: [], activeProfile: undefined };
	const loadedExtensions = manifestResult
		? await loadManifestExtensions(
				manifestResult.manifest,
				manifestResult.path,
				resolved.extensions,
			)
		: [];
	const kv = options.profilePath
		? new JsonlKvBackend({ dataFilePath: resolve(options.profilePath) })
		: new MemoryKvBackend();
	const driver = new CoreKvSettingsStorageDriver(kv);

	// Load existing settings metadata if any
	const settingsDoc = await driver.loadSettings();
	const activeProfileId =
		settingsDoc.activeProfile ??
		resolved.activeProfile ??
		manifestResult?.manifest.activeProfile ??
		"base";

	// Seed profile into driver if passed explicitly
	if (profile && profile.id) {
		const existing = await driver.loadProfile(profile.id);
		if (!existing) {
			await driver.saveProfile(profile.id, profile);
		}
	}

	// Resolve the active profile through the storage driver
	const resolvedProfile = await resolveProfile(
		activeProfileId,
		driver,
		profile,
	);

	const initialLocale =
		options.locale ??
		(settingsDoc as any).locale ??
		resolvedProfile.locale ??
		"en";

	const i18n = createDefaultI18nKernel(initialLocale);
	registerCliLocales(i18n);

	// Load existing extension configs from storage driver
	const extensionConfigs: Record<string, Record<string, unknown>> = {};
	for (const ext of loadedExtensions) {
		const extId = ext.extension.manifest.id;
		const cfg = await driver.loadExtensionConfig(extId);
		if (cfg) {
			extensionConfigs[extId] = cfg as Record<string, unknown>;
		}
	}

	const settings = new WorkspaceSettingsService({
		defaults: {
			...DEFAULT_WORKSPACE_SETTINGS_VALUES,
			locale: initialLocale,
		},
		schema: getDefaultSettingsSchema(i18n),
		initial: {
			...DEFAULT_WORKSPACE_SETTINGS_VALUES,
			...(resolvedProfile as Record<string, unknown>),
			...(settingsDoc as Record<string, unknown>),
			...(Object.keys(extensionConfigs).length > 0
				? { extensions: extensionConfigs }
				: {}),
		},
		driver,
		activeProfileId,
		baseProfile: resolvedProfile,
	});

	const workspace = createMacroWorkspace({
		initialText: options.initialText,
		initialLocale,
		profile: resolvedProfile,
		settings,
	});
	workspace.tabs.registerTabProvider("settings", {
		...createSettingsTabProvider(workspace, keymap),
	});
	workspace.tabs.registerTabProvider("extensions", {
		render: () =>
			createElement(BuiltinActivityPanel, {
				workspace,
				keymap,
				kind: "extensions",
				width: 60,
				activeProfile: resolved.activeProfile,
				resolvedExtensionIds: resolved.extensions.map(
					(extension) => extension.id,
				),
			}),
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
		activeProfile: resolved.activeProfile,
		resolvedExtensionIds: resolved.extensions.map((extension) => extension.id),
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
	if (manifest.activeProfile !== undefined) {
		if (
			!manifest.profiles ||
			!Object.hasOwn(manifest.profiles, manifest.activeProfile)
		) {
			throw new Error(
				`Unknown active workspace profile '${manifest.activeProfile}'`,
			);
		}
	}
	for (const [profileId, extensionIds] of Object.entries(
		manifest.profiles ?? {},
	)) {
		if (
			!profileId ||
			!Array.isArray(extensionIds) ||
			extensionIds.some((id) => typeof id !== "string" || !id)
		) {
			throw new Error(`Invalid workspace extension profile '${profileId}'`);
		}
		const profileIds = new Set<string>();
		for (const id of extensionIds) {
			if (profileIds.has(id))
				throw new Error(
					`Duplicate extension '${id}' in workspace profile '${profileId}'`,
				);
			if (!ids.has(id))
				throw new Error(
					`Workspace profile '${profileId}' references unknown extension '${id}'`,
				);
			profileIds.add(id);
		}
	}
}

export function resolveWorkspaceExtensions(manifest: MacroWorkspaceManifest): {
	readonly extensions: readonly WorkspaceExtensionSpec[];
	readonly activeProfile?: string;
} {
	validateWorkspaceManifest(manifest);
	const byId = new Map(
		manifest.extensions.map((extension) => [extension.id, extension]),
	);
	const selected =
		manifest.activeProfile === undefined
			? manifest.extensions.map((extension) => extension.id)
			: [...(manifest.profiles?.[manifest.activeProfile] ?? [])];
	const resolved = new Set<string>();
	const visiting = new Set<string>();
	const visit = (id: string): void => {
		if (resolved.has(id)) return;
		if (visiting.has(id))
			throw new Error(
				`Cyclic workspace extension dependency involving '${id}'`,
			);
		const extension = byId.get(id);
		if (!extension)
			throw new Error(`Workspace extension '${id}' is not declared`);
		visiting.add(id);
		for (const dependency of extension.requires ?? []) {
			if (!byId.has(dependency))
				throw new Error(
					`Workspace extension '${id}' requires unavailable extension '${dependency}'`,
				);
			visit(dependency);
		}
		visiting.delete(id);
		resolved.add(id);
	};
	for (const id of selected) visit(id);
	return {
		extensions: manifest.extensions.filter((extension) =>
			resolved.has(extension.id),
		),
		...(manifest.activeProfile === undefined
			? {}
			: { activeProfile: manifest.activeProfile }),
	};
}

async function loadManifestExtensions(
	manifest: MacroWorkspaceManifest,
	manifestPath: string,
	selectedExtensions: readonly WorkspaceExtensionSpec[],
): Promise<LoadedExtension[]> {
	validateWorkspaceManifest(manifest);
	const manifestDirectory = dirname(manifestPath);
	const files = selectedExtensions.map((entry) =>
		resolve(manifestDirectory, entry.source),
	);
	const listedPaths = new Set(
		manifest.extensions.map((entry) =>
			resolve(manifestDirectory, entry.source),
		),
	);
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
