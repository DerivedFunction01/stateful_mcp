import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	type HistoryResource,
	type HistoryResourceStore,
	JsonlKvBackend,
	KvHistoryResourceStore,
	SqlBackend,
	SqlExecutor,
	SqlHistoryResourceStore,
} from "@stateful-mcp/core";
import {
	type MacroProjectBackendKind,
	MacroProjectConflictError,
	type MacroProjectDescriptor,
	type MacroProjectExtensionSpec,
	MacroProjectFormatError,
	type MacroProjectManifest,
	type MacroProjectResourceReference,
} from "@stateful-mcp/macro";

export const MACRO_PROJECT_FORMAT_VERSION = 1;
export const MACRO_DIRECTORY = ".macro";
export const MACRO_MANIFEST_FILE = "project.json";
export const MACRO_DEFAULT_HISTORY_ID = "default-history";
const JSONL_STATE_FILE = "state.jsonl";

export interface CreateMacroProjectOptions {
	readonly rootPath: string;
	readonly displayName?: string;
	readonly backend?: MacroProjectBackendKind;
	readonly extensions?: readonly MacroProjectExtensionSpec[];
	readonly defaultProfileId?: string;
	readonly uiLocale?: string;
}

export interface OpenMacroProjectOptions {
	readonly rootPath: string;
}

export interface MacroProject {
	readonly manifest: MacroProjectManifest;
	readonly rootPath: string;
	readonly manifestPath: string;
	readonly history: HistoryResourceStore;
	readonly descriptor: MacroProjectDescriptor;
	createHistory(
		historyId: string,
		metadata?: Record<string, unknown>,
	): Promise<HistoryResource>;
	openHistory(historyId: string): Promise<HistoryResource | null>;
	saveHistory(
		resource: HistoryResource,
		expectedRevision?: string,
	): Promise<string>;
	listHistory(): ReturnType<HistoryResourceStore["list"]>;
	deleteHistory(historyId: string, expectedRevision?: string): Promise<void>;
	saveManifest(
		manifest: MacroProjectManifest,
		expectedRevision: string,
	): Promise<MacroProject>;
	close(): Promise<void>;
}

export async function createMacroProject(
	options: CreateMacroProjectOptions,
): Promise<MacroProject> {
	const rootPath = await canonicalRoot(options.rootPath);
	const macroPath = join(rootPath, MACRO_DIRECTORY);
	const manifestPath = join(macroPath, MACRO_MANIFEST_FILE);
	if (await exists(macroPath)) {
		throw new MacroProjectConflictError("A Macro project already exists", {
			rootPath,
			manifestPath,
		});
	}
	await mkdir(macroPath, { recursive: true });
	const backend = options.backend ?? "jsonl";
	const projectId = randomUUID();
	const historyReference: MacroProjectResourceReference = {
		resourceId: MACRO_DEFAULT_HISTORY_ID,
		kind: "history",
	};
	const manifest: MacroProjectManifest = {
		formatVersion: MACRO_PROJECT_FORMAT_VERSION,
		projectId,
		displayName: options.displayName ?? rootPath.split("/").pop() ?? projectId,
		backend: {
			kind: backend,
			path: `${MACRO_DIRECTORY}/${backend === "jsonl" ? JSONL_STATE_FILE : "state.sqlite"}`,
		},
		...(options.defaultProfileId
			? { defaultProfileId: options.defaultProfileId }
			: {}),
		...(options.uiLocale ? { uiLocale: options.uiLocale } : {}),
		extensions: [...(options.extensions ?? [])],
		resources: [],
		historyResources: [historyReference],
	};
	const storage = await openHistoryStorage(
		backend,
		join(rootPath, manifest.backend.path),
	);
	const history = storage.history;
	await history.create(MACRO_DEFAULT_HISTORY_ID, { projectId, default: true });
	await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
	await storage.flush();
	return openMacroProject({ rootPath });
}

export async function openMacroProject(
	options: OpenMacroProjectOptions,
): Promise<MacroProject> {
	const rootPath = resolve(options.rootPath);
	const manifestPath = join(rootPath, MACRO_DIRECTORY, MACRO_MANIFEST_FILE);
	let manifest: MacroProjectManifest;
	try {
		manifest = JSON.parse(
			await readFile(manifestPath, "utf8"),
		) as MacroProjectManifest;
	} catch (error) {
		throw new MacroProjectFormatError(
			`Unable to open Macro project manifest at ${manifestPath}: ${String(error)}`,
		);
	}
	validateMacroProjectManifest(manifest);
	const expectedPath = resolve(rootPath, manifest.backend.path);
	if (!isWithin(rootPath, expectedPath)) {
		throw new MacroProjectFormatError(
			"Project backend path escapes project root",
		);
	}
	const storage = await openHistoryStorage(manifest.backend.kind, expectedPath);
	return new MacroProjectHandle(
		rootPath,
		manifestPath,
		manifest,
		storage.history,
		storage.flush,
	);
}

export function validateMacroProjectManifest(
	manifest: MacroProjectManifest,
): void {
	if (!manifest || typeof manifest !== "object")
		throw new MacroProjectFormatError("Project manifest must be an object");
	if (manifest.formatVersion !== MACRO_PROJECT_FORMAT_VERSION)
		throw new MacroProjectFormatError(
			`Unsupported Macro project format version '${String(manifest.formatVersion)}'`,
		);
	if (!manifest.projectId || !manifest.displayName)
		throw new MacroProjectFormatError(
			"Project manifest requires identity metadata",
		);
	if (
		!manifest.backend ||
		!["jsonl", "sqlite"].includes(manifest.backend.kind) ||
		!manifest.backend.path
	)
		throw new MacroProjectFormatError(
			"Project manifest has an invalid backend",
		);
	if (!Array.isArray(manifest.extensions) || !Array.isArray(manifest.resources))
		throw new MacroProjectFormatError(
			"Project manifest has invalid resource data",
		);
	if (!Array.isArray(manifest.historyResources))
		throw new MacroProjectFormatError(
			"Project manifest requires history resources",
		);
}

class MacroProjectHandle implements MacroProject {
	private closed = false;
	private currentManifest: MacroProjectManifest;
	private currentRevision: string;

	constructor(
		readonly rootPath: string,
		readonly manifestPath: string,
		manifest: MacroProjectManifest,
		readonly history: HistoryResourceStore,
		private readonly flush: () => Promise<void>,
	) {
		this.currentManifest = manifest;
		this.currentRevision = hashJson(manifest);
	}

	get manifest(): MacroProjectManifest {
		return this.currentManifest;
	}

	get descriptor(): MacroProjectDescriptor {
		return {
			projectId: this.currentManifest.projectId,
			displayName: this.currentManifest.displayName,
			rootPath: this.rootPath,
			manifestPath: this.manifestPath,
			backend: this.currentManifest.backend,
			lifecycle: this.closed ? "closed" : "open",
			revision: this.currentRevision,
			resources: this.currentManifest.resources,
			historyResources: this.currentManifest.historyResources,
		};
	}

	async createHistory(
		historyId: string,
		metadata: Record<string, unknown> = {},
	) {
		this.assertOpen();
		const resource = await this.history.create(historyId, {
			...metadata,
			projectId: this.currentManifest.projectId,
		});
		const reference = { resourceId: historyId, kind: "history" };
		if (
			!this.currentManifest.historyResources.some(
				(item) => item.resourceId === historyId,
			)
		) {
			await this.saveManifest(
				{
					...this.currentManifest,
					historyResources: [
						...this.currentManifest.historyResources,
						reference,
					],
				},
				this.currentRevision,
			);
		}
		return resource;
	}

	openHistory(historyId: string) {
		this.assertOpen();
		return this.history.open(historyId);
	}

	async saveHistory(
		resource: HistoryResource,
		expectedRevision?: string,
	): Promise<string> {
		this.assertOpen();
		const current = await this.history.open(resource.historyId);
		if (
			expectedRevision &&
			(!current || hashJson(current) !== expectedRevision)
		) {
			throw new MacroProjectConflictError(
				"History resource revision is stale",
				{
					historyId: resource.historyId,
					expectedRevision,
					actualRevision: current ? hashJson(current) : undefined,
				},
			);
		}
		await this.history.save(resource);
		const saved = await this.history.open(resource.historyId);
		const revision = saved ? hashJson(saved) : hashJson(resource);
		const historyResources = this.currentManifest.historyResources.map(
			(item) =>
				item.resourceId === resource.historyId ? { ...item, revision } : item,
		);
		if (
			!historyResources.some((item) => item.resourceId === resource.historyId)
		) {
			historyResources.push({
				resourceId: resource.historyId,
				kind: "history",
				revision,
			});
		}
		await this.saveManifest(
			{ ...this.currentManifest, historyResources },
			this.currentRevision,
		);
		return revision;
	}

	listHistory() {
		this.assertOpen();
		return this.history.list();
	}

	async deleteHistory(
		historyId: string,
		expectedRevision?: string,
	): Promise<void> {
		this.assertOpen();
		const current = await this.history.open(historyId);
		if (!current) return;
		if (expectedRevision && hashJson(current) !== expectedRevision)
			throw new MacroProjectConflictError(
				"History resource revision is stale",
				{ historyId },
			);
		await this.history.delete(historyId);
		await this.saveManifest(
			{
				...this.currentManifest,
				historyResources: this.currentManifest.historyResources.filter(
					(item) => item.resourceId !== historyId,
				),
			},
			this.currentRevision,
		);
	}

	async saveManifest(
		manifest: MacroProjectManifest,
		expectedRevision: string,
	): Promise<MacroProject> {
		this.assertOpen();
		const disk = JSON.parse(
			await readFile(this.manifestPath, "utf8"),
		) as MacroProjectManifest;
		const diskRevision = hashJson(disk);
		if (diskRevision !== expectedRevision)
			throw new MacroProjectConflictError(
				"Project manifest revision is stale",
				{ expectedRevision, actualRevision: diskRevision },
			);
		validateMacroProjectManifest(manifest);
		await atomicWrite(this.manifestPath, JSON.stringify(manifest, null, 2));
		this.currentManifest = manifest;
		this.currentRevision = hashJson(manifest);
		return this;
	}

	async close(): Promise<void> {
		if (!this.closed) {
			await this.flush();
			this.closed = true;
		}
	}

	private assertOpen(): void {
		if (this.closed) throw new Error("Macro project is closed");
	}
}

async function openHistoryStorage(
	kind: MacroProjectBackendKind,
	path: string,
): Promise<{ history: HistoryResourceStore; flush: () => Promise<void> }> {
	if (kind === "jsonl") {
		const backend = new JsonlKvBackend({ dataFilePath: path });
		return {
			history: new KvHistoryResourceStore(backend),
			flush: () => backend.save(),
		};
	}
	const backend = await SqlBackend.connect("sqlite", path);
	return {
		history: new SqlHistoryResourceStore(new SqlExecutor(backend)),
		flush: async () => undefined,
	};
}

function hashJson(value: unknown): string {
	let hash = 2166136261;
	for (const character of JSON.stringify(value)) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a:${(hash >>> 0).toString(16)}`;
}

async function canonicalRoot(rootPath: string): Promise<string> {
	const path = resolve(rootPath);
	await mkdir(path, { recursive: true });
	return path;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function isWithin(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function atomicWrite(path: string, content: string): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${content}\n`, "utf8");
	await rename(temporary, path);
}
