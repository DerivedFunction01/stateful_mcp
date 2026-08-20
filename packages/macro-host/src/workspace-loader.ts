import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type {
	I18nKernel,
	LoadedExtension,
	SettingsSchemaEntry,
	SettingsSemanticProvider,
	UserMacroProfile,
} from "@stateful-mcp/macro";
import {
	CoreKvSettingsBundleStorage,
	CoreKvSettingsStorageDriver,
	CoreSqlSettingsBundleStorage,
	CoreSqlSettingsStorageDriver,
	createDefaultI18nKernel,
	createMacroWorkspace,
	ExtensionError,
	ExtensionLoader as MacroExtensionLoader,
	type MacroWorkspace,
	resolveProfile,
	WorkspaceSettingsService,
} from "@stateful-mcp/macro";
import {
	type CreateMacroProjectOptions,
	createMacroProject,
	type MacroProject,
	openMacroProject,
} from "./project-store";

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

export interface LoadedMacroWorkspace {
	readonly workspace: MacroWorkspace;
	readonly manifest?: MacroWorkspaceManifest;
	readonly manifestPath?: string;
	readonly profile?: UserMacroProfile;
	readonly loadedExtensions: readonly LoadedExtension[];
	readonly activeProfile?: string;
	readonly resolvedExtensionIds: readonly string[];
	readonly project?: MacroProject;
}

export interface MacroHostSettingsOptions {
	readonly defaults: Readonly<Record<string, unknown>>;
	readonly schema?:
		| readonly SettingsSchemaEntry[]
		| ((i18n: I18nKernel) => readonly SettingsSchemaEntry[]);
	readonly configureI18n?: (i18n: I18nKernel) => void;
	readonly semanticProviders?: readonly SettingsSemanticProvider[];
}

export interface LoadMacroWorkspaceOptions {
	readonly projectRoot?: string;
	readonly workspacePath?: string;
	readonly profilePath?: string;
	readonly profileId?: string;
	readonly extensionProfileId?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly settings?: MacroHostSettingsOptions;
}

export interface MacroHostOptions extends MacroHostSettingsOptions {
	readonly projectRoot?: string;
	readonly workspacePath?: string;
	readonly profilePath?: string;
}

export class MacroHost {
	private readonly options: MacroHostOptions;
	private readonly workspaces = new Set<MacroWorkspace>();
	private readonly projects = new Set<MacroProject>();

	private constructor(options: MacroHostOptions) {
		this.options = options;
	}

	static async create(options: MacroHostOptions): Promise<MacroHost> {
		return new MacroHost(options);
	}

	async createWorkspace(
		options: Omit<
			LoadMacroWorkspaceOptions,
			"workspacePath" | "profilePath"
		> = {},
	): Promise<LoadedMacroWorkspace> {
		const loaded = await loadMacroWorkspace({
			...this.options,
			...options,
			settings: {
				defaults: this.options.defaults,
				schema: this.options.schema,
				configureI18n: this.options.configureI18n,
			},
		});
		if (loaded.project) this.projects.add(loaded.project);
		this.workspaces.add(loaded.workspace);
		return loaded;
	}

	async dispose(): Promise<void> {
		for (const workspace of [...this.workspaces]) await workspace.dispose();
		this.workspaces.clear();
		for (const project of this.projects) await project.close();
		this.projects.clear();
	}

	async createProject(
		options: CreateMacroProjectOptions,
	): Promise<MacroProject> {
		const project = await createMacroProject(options);
		this.projects.add(project);
		return project;
	}

	async openProject(rootPath: string): Promise<MacroProject> {
		const project = await openMacroProject({ rootPath });
		this.projects.add(project);
		return project;
	}
}

export async function createMacroHost(
	options: MacroHostOptions,
): Promise<MacroHost> {
	return MacroHost.create(options);
}

export async function loadMacroWorkspace(
	options: LoadMacroWorkspaceOptions = {},
): Promise<LoadedMacroWorkspace> {
	const project = options.projectRoot
		? await openMacroProject({ rootPath: options.projectRoot })
		: undefined;
	const manifestResult = project
		? {
				manifest: toWorkspaceManifest(project.manifest),
				path: project.manifestPath,
			}
		: options.workspacePath
			? await readWorkspaceManifest(options.workspacePath)
			: undefined;
	const effectiveProfilePath =
		project?.manifest.backend.kind === "jsonl"
			? resolve(project.rootPath, project.manifest.backend.path)
			: options.profilePath;
	const profile = effectiveProfilePath
		? await readJsonFile<UserMacroProfile>(effectiveProfilePath).catch(
				() => undefined,
			)
		: undefined;
	const resolved = manifestResult
		? resolveWorkspaceExtensions(
				manifestResult.manifest,
				options.extensionProfileId,
			)
		: { extensions: [], activeProfile: undefined };
	const loadedExtensions = manifestResult
		? await loadManifestExtensions(
				manifestResult.manifest,
				manifestResult.path,
				resolved.extensions,
			)
		: [];
	const sqlBackend =
		project?.manifest.backend.kind === "sqlite"
			? await SqlBackend.connect(
					"sqlite",
					resolve(project.rootPath, project.manifest.backend.path),
				)
			: undefined;
	const kv = effectiveProfilePath
		? new JsonlKvBackend({ dataFilePath: resolve(effectiveProfilePath) })
		: new MemoryKvBackend();
	const driver = sqlBackend
		? new CoreSqlSettingsStorageDriver(new SqlExecutor(sqlBackend))
		: new CoreKvSettingsStorageDriver(kv);

	const bundle = sqlBackend
		? new CoreSqlSettingsBundleStorage(driver, new SqlExecutor(sqlBackend))
		: new CoreKvSettingsBundleStorage(driver, kv);

	// Load existing settings metadata if any
	const settingsDoc = await driver.loadSettings();
	const activeProfileId =
		options.profileId ?? settingsDoc.activeProfile ?? "base";

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
		(project?.manifest.uiLocale as string | undefined) ??
		(settingsDoc as any).uiLocale ??
		(settingsDoc as any).locale ??
		resolvedProfile.locale ??
		"en";

	const i18n = createDefaultI18nKernel(initialLocale);
	(options.settings?.configureI18n ?? (() => undefined))(i18n);
	const settingsDefaults = options.settings?.defaults ?? {};
	const settingsSchema =
		typeof options.settings?.schema === "function"
			? options.settings.schema(i18n)
			: (options.settings?.schema ?? []);

	// Load existing extension configs from storage driver
	const extensionConfigs: Record<string, Record<string, unknown>> = {};
	for (const ext of loadedExtensions) {
		const extId = ext.extension.manifest.id;
		const cfg = await driver.loadExtensionConfig(extId);
		if (cfg) {
			extensionConfigs[extId] = cfg as Record<string, unknown>;
		}
	}
	const initialBundle = await bundle.load();

	const settings = new WorkspaceSettingsService({
		defaults: {
			...settingsDefaults,
			uiLocale: initialLocale,
			locale: initialLocale,
		},
		schema: settingsSchema,
		initial: {
			...settingsDefaults,
			uiLocale: initialLocale,
			...(resolvedProfile as Record<string, unknown>),
			...(settingsDoc as Record<string, unknown>),
			...(Object.keys(extensionConfigs).length > 0
				? { extensions: extensionConfigs }
				: {}),
		},
		driver,
		bundle,
		bundleRevision: initialBundle.revision,
		activeProfileId,
		baseProfile: resolvedProfile,
		semanticProviders: options.settings?.semanticProviders,
	});

	const workspace = createMacroWorkspace({
		initialText: options.initialText,
		initialLocale,
		profile: resolvedProfile,
		settings,
	});

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
		loadedExtensions,
		activeProfile: resolved.activeProfile,
		resolvedExtensionIds: resolved.extensions.map((extension) => extension.id),
		...(project ? { project } : {}),
	};
}

function toWorkspaceManifest(
	manifest: import("@stateful-mcp/macro").MacroProjectManifest,
): MacroWorkspaceManifest {
	return {
		extensions: manifest.extensions,
		profiles: manifest.extensionProfiles,
		activeProfile: manifest.activeProfileId,
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

export function resolveWorkspaceExtensions(
	manifest: MacroWorkspaceManifest,
	profileId?: string,
): {
	readonly extensions: readonly WorkspaceExtensionSpec[];
	readonly activeProfile?: string;
} {
	validateWorkspaceManifest(manifest);
	if (
		profileId !== undefined &&
		(!manifest.profiles || !Object.hasOwn(manifest.profiles, profileId))
	) {
		throw new Error(`Unknown active workspace profile '${profileId}'`);
	}
	const byId = new Map(
		manifest.extensions.map((extension) => [extension.id, extension]),
	);
	const activeProfile = profileId ?? manifest.activeProfile;
	const selected =
		activeProfile === undefined
			? manifest.extensions.map((extension) => extension.id)
			: [...(manifest.profiles?.[activeProfile] ?? [])];
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
		...(activeProfile === undefined ? {} : { activeProfile }),
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
