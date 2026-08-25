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
	ProjectExtensionActivationGroupMap,
	ProjectExtensionGroupDiagnostic,
	ProjectExtensionGroupResolution,
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
	createDefaultSettingsSchema,
	createMacroWorkspace,
	ExtensionError,
	type MacroDocumentTemplate,
	ExtensionLoader as MacroExtensionLoader,
	type MacroWorkspace,
	resolveProfile,
	resolveProjectExtensionGroup,
	validateProjectExtensionGroups,
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
	/** Extension Activation Groups keyed by their stable identifier. */
	readonly extensionGroups?: ProjectExtensionActivationGroupMap;
	readonly activeExtensionGroupId?: string;
	readonly templates?: readonly import("@stateful-mcp/macro").MacroDocumentTemplate[];
}

export interface LoadedMacroWorkspace {
	readonly workspace: MacroWorkspace;
	readonly manifest?: MacroWorkspaceManifest;
	readonly manifestPath?: string;
	readonly profile?: UserMacroProfile;
	readonly loadedExtensions: readonly LoadedExtension[];
	readonly activeExtensionGroupId?: string;
	readonly resolvedExtensionIds: readonly string[];
	/** Canonical resolution used to select and order the activated extensions. */
	readonly extensionGroupResolution: ProjectExtensionGroupResolution;
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
	readonly extensionGroupId?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly templates?: readonly MacroDocumentTemplate[];
	readonly settings?: MacroHostSettingsOptions;
}

export interface MacroHostOptions extends MacroHostSettingsOptions {
	readonly projectRoot?: string;
	readonly workspacePath?: string;
	readonly profilePath?: string;
	readonly templates?: readonly MacroDocumentTemplate[];
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
	let project: MacroProject | undefined;
	if (options.projectRoot) {
		try {
			project = await openMacroProject({ rootPath: options.projectRoot });
		} catch {
			project = await createMacroProject({ rootPath: options.projectRoot });
		}
	}
	const manifestResult = project
		? {
				manifest: toWorkspaceManifest(project.manifest),
				path: project.manifestPath,
			}
		: options.workspacePath
			? await readWorkspaceManifest(options.workspacePath)
			: undefined;
	const userTemplates = await readJsonFile<MacroDocumentTemplate[]>(
		resolve(
			options.projectRoot ?? process.cwd(),
			".macro-user",
			"templates.json",
		),
	).catch(() => []);
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
				options.extensionGroupId,
			)
		: {
				extensions: [],
				resolution: resolveProjectExtensionGroup({ extensions: [] }),
			};
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
			: (options.settings?.schema ?? createDefaultSettingsSchema(i18n));

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
		templates: [
			...userTemplates.map((template) => ({
				...template,
				source: "user" as const,
			})),
			...(manifestResult?.manifest.templates ?? []).map((template) => ({
				...template,
				source: "project" as const,
			})),
			...(options.templates ?? []).map((template) => ({
				...template,
				source: template.source ?? ("extension" as const),
				isReadonly: template.isReadonly ?? true,
			})),
		],
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
	const activeDocument = workspace.documents.active();
	if (activeDocument) await activeDocument.session.parseAllLines();

	return {
		workspace,
		manifest: manifestResult?.manifest,
		manifestPath: manifestResult?.path,
		profile,
		loadedExtensions,
		...(resolved.activeExtensionGroupId === undefined
			? {}
			: { activeExtensionGroupId: resolved.activeExtensionGroupId }),
		resolvedExtensionIds: resolved.extensions.map((extension) => extension.id),
		extensionGroupResolution: resolved.resolution,
		...(project ? { project } : {}),
	};
}

function toWorkspaceManifest(
	manifest: import("@stateful-mcp/macro").MacroProjectManifest,
): MacroWorkspaceManifest {
	return {
		extensions: manifest.extensions,
		...(manifest.extensionGroups
			? { extensionGroups: manifest.extensionGroups }
			: {}),
		...(manifest.activeExtensionGroupId === undefined
			? {}
			: { activeExtensionGroupId: manifest.activeExtensionGroupId }),
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
	assertNoGroupErrors(
		validateProjectExtensionGroups({
			extensions: manifest.extensions,
			...(manifest.extensionGroups ? { groups: manifest.extensionGroups } : {}),
			...(manifest.activeExtensionGroupId === undefined
				? {}
				: { activeGroupId: manifest.activeExtensionGroupId }),
		}),
	);
}

function assertNoGroupErrors(
	diagnostics: readonly ProjectExtensionGroupDiagnostic[],
): void {
	const errors = diagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	);
	if (errors.length === 0) return;
	throw new Error(
		`Invalid workspace extension activation group: ${errors
			.map((diagnostic) => diagnostic.messageKey)
			.join("; ")}`,
	);
}

export interface WorkspaceExtensionResolution {
	/** Resolved extensions in manifest declaration order. */
	readonly extensions: readonly WorkspaceExtensionSpec[];
	readonly activeExtensionGroupId?: string;
	readonly resolution: ProjectExtensionGroupResolution;
}

/**
 * Selects the extensions an activation group requires. Dependency closure,
 * ordering, and diagnostics come from the canonical resolver in
 * `@stateful-mcp/macro`; this wrapper only maps the result back onto manifest
 * declarations and turns blocking diagnostics into load failures.
 */
export function resolveWorkspaceExtensions(
	manifest: MacroWorkspaceManifest,
	groupId?: string,
): WorkspaceExtensionResolution {
	validateWorkspaceManifest(manifest);
	const activeExtensionGroupId = groupId ?? manifest.activeExtensionGroupId;
	const resolution = resolveProjectExtensionGroup({
		extensions: manifest.extensions,
		...(manifest.extensionGroups ? { groups: manifest.extensionGroups } : {}),
		...(activeExtensionGroupId === undefined
			? {}
			: { groupId: activeExtensionGroupId }),
	});
	assertNoGroupErrors(resolution.diagnostics);
	const selected = new Set(resolution.resolvedExtensionIds);
	return {
		extensions: manifest.extensions.filter((extension) =>
			selected.has(extension.id),
		),
		...(activeExtensionGroupId === undefined ? {} : { activeExtensionGroupId }),
		resolution,
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
				{
					messageKey: "host.workspace.extensionUnlisted",
					messageParams: { sourceFile: discovered },
					sourceFile: discovered,
				},
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
				{
					messageKey: "host.workspace.extensionUnlisted",
					messageParams: { extensionId: item.extension.manifest.id },
					extensionId: item.extension.manifest.id,
					sourceFile: item.sourceFile,
				},
			);
		}
		if (expected.version !== item.extension.manifest.version) {
			throw new ExtensionError(
				{
					messageKey: "host.workspace.extensionVersionMismatch",
					messageParams: { extensionId: expected.id, expected: expected.version, actual: item.extension.manifest.version },
					extensionId: expected.id,
					sourceFile: item.sourceFile,
				},
			);
		}
	}
	const listed = new Set(manifest.extensions.map((entry) => entry.id));
	for (const item of loaded) {
		for (const dependency of item.extension.manifest.requires ?? []) {
			if (!listed.has(dependency)) {
				throw new ExtensionError(
					{
						messageKey: "host.workspace.dependencyUnlisted",
						messageParams: { extensionId: item.extension.manifest.id, dependency },
						extensionId: item.extension.manifest.id,
						sourceFile: item.sourceFile,
					},
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
