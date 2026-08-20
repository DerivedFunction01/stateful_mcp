import { SETTINGS_REDACTION_MARKER } from "@stateful-mcp/macro-protocol";
import type { UserMacroProfile } from "../../contracts/extension-config";
import { computeSparseDelta, resolveProfile } from "./profile-resolver";
import {
	SettingsBundleConflictError,
	type SettingsBundleSnapshot,
} from "./settings-bundle";
import type {
	SettingsStorageDriver,
	WorkspaceSettings,
} from "./storage-driver";

export type SettingsFormWidget =
	| "toggle"
	| "input"
	| "dropdown"
	| "slider"
	| "color-picker"
	| "date-picker"
	| "tag-input"
	| "table"
	| "keymap"
	| "json-editor"
	| "custom";

export interface EnumOptionDefinition {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly meta?: string;
}

export interface SettingsSchemaEntry {
	readonly path: readonly string[];
	readonly type:
		| "boolean"
		| "number"
		| "string"
		| "enum"
		| "array"
		| "object"
		| "json"
		| "keymap";
	readonly title: string;
	readonly description?: string;
	readonly widget?: SettingsFormWidget;
	readonly category?: string;
	readonly group?: string;
	readonly order?: number;
	readonly placeholder?: string;
	readonly enumValues?: readonly string[];
	readonly enumOptions?: readonly EnumOptionDefinition[];
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	readonly tagDelimiters?: readonly string[];
	readonly customWidgetId?: string;
	readonly restartRequired?: boolean;
	readonly sensitive?: boolean;
}

export interface SettingsDiagnostic {
	readonly severity: "error" | "warning";
	readonly path?: readonly string[];
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly restartRequired?: boolean;
}

export type SettingsSaveResult =
	| {
			readonly status: "saved";
			readonly restartRequired: boolean;
			readonly settingsRevision: string;
	  }
	| {
			readonly status: "blocked";
			readonly diagnostics: readonly SettingsDiagnostic[];
	  }
	| {
			readonly status: "conflict";
			readonly expectedRevision: string;
			readonly actualRevision: string;
	  };

export interface SettingsStorage {
	read(): Promise<string | null> | string | null;
	write(content: string): Promise<void> | void;
	reset(): Promise<void> | void;
}

export interface SettingsBundlePayload {
	readonly $schema?: string;
	readonly version: 1;
	readonly exportedAt: string;
	readonly workspace?: WorkspaceSettings;
	readonly profiles?: Readonly<Record<string, Partial<UserMacroProfile>>>;
	readonly extensions?: Readonly<Record<string, Record<string, unknown>>>;
}

export interface WorkspaceSettingsServiceOptions {
	readonly defaults: Readonly<Record<string, unknown>>;
	readonly initial?: Readonly<Record<string, unknown>>;
	readonly schema?: readonly SettingsSchemaEntry[];
	readonly storage?: SettingsStorage;
	readonly driver?: SettingsStorageDriver;
	readonly activeProfileId?: string;
	readonly baseProfile?: UserMacroProfile;
	readonly bundleRevision?: string;
	readonly customValidate?: (
		draft: Readonly<Record<string, unknown>>,
	) => readonly SettingsDiagnostic[];
	readonly bundle?: {
		load(): Promise<SettingsBundleSnapshot>;
		save(
			next: Omit<SettingsBundleSnapshot, "revision">,
			expectedRevision: string,
		): Promise<string>;
	};
}

export class WorkspaceSettingsService {
	private effective: Record<string, unknown>;
	private draft: Record<string, unknown>;
	private rawText: string;
	private diagnostics: readonly SettingsDiagnostic[] = [];
	private rawParseValid = true;
	private readonly listeners = new Set<() => void>();
	private readonly coreDefaults: Readonly<Record<string, unknown>>;
	private readonly coreSchema: readonly SettingsSchemaEntry[];
	private defaults: Readonly<Record<string, unknown>>;
	private schema: readonly SettingsSchemaEntry[];
	private activeProfileId: string;
	private baseProfile?: UserMacroProfile;
	private driver?: SettingsStorageDriver;
	private readonly bundle?: WorkspaceSettingsServiceOptions["bundle"];
	private bundleRevision = "";
	private bundleRevisionLoad?: Promise<string>;

	constructor(private readonly options: WorkspaceSettingsServiceOptions) {
		this.coreDefaults = options.defaults;
		this.coreSchema = options.schema ?? [];
		this.defaults = options.defaults;
		this.schema = options.schema ?? [];
		this.activeProfileId = options.activeProfileId ?? "base";
		this.baseProfile = options.baseProfile;
		this.driver = options.driver;
		this.bundle = options.bundle;
		this.bundleRevision = options.bundleRevision ?? "";
		this.effective = clone(options.initial ?? options.defaults);
		this.draft = clone(this.effective);
		this.rawText = JSON.stringify(this.draft, null, 2);
		if (this.bundle && !this.bundleRevision) {
			this.bundleRevisionLoad = this.loadBundleRevision().then((revision) => {
				this.bundleRevision = revision;
				return revision;
			});
		}
	}

	getEffective(): Readonly<Record<string, unknown>> {
		return this.effective;
	}
	getDraft(): Readonly<Record<string, unknown>> {
		return this.draft;
	}
	getRawText(): string {
		return this.rawText;
	}
	getDiagnostics(): readonly SettingsDiagnostic[] {
		return this.diagnostics;
	}

	getSettingsRevision(): string {
		return this.bundleRevision;
	}

	async exportBundle(profileId: string): Promise<{
		readonly revision: string;
		readonly bundle: SettingsBundlePayload;
	}> {
		if (!this.bundle) throw new Error("Settings bundle storage is unavailable");
		await this.ensureBundleRevision();
		const current = await this.bundle.load();
		const profile = current.profiles[profileId];
		return {
			revision: current.revision,
			bundle: {
				$schema: "https://schema.stateful-mcp.org/settings-bundle.v1.json",
				version: 1,
				exportedAt: new Date().toISOString(),
				workspace: current.settings,
				profiles: profile ? { [profileId]: profile } : {},
				extensions: current.extensions,
			},
		};
	}

	async applyBundle(
		bundle: SettingsBundlePayload,
		profileId: string,
		mode: "merge" | "replace",
		expectedRevision: string,
	): Promise<SettingsSaveResult> {
		if (!this.bundle) throw new Error("Settings bundle storage is unavailable");
		if (bundle.version !== 1)
			return {
				status: "blocked",
				diagnostics: [
					{
						severity: "error",
						message: "Invalid or unsupported settings bundle version",
					},
				],
			};

		await this.ensureBundleRevision();
		const current = await this.bundle.load();
		if (current.revision !== expectedRevision)
			return {
				status: "conflict",
				expectedRevision,
				actualRevision: current.revision,
			};

		const profiles = { ...current.profiles };
		const importedProfile = bundle.profiles?.[profileId];
		if (importedProfile) {
			profiles[profileId] =
				mode === "merge"
					? ({ ...profiles[profileId], ...importedProfile } as UserMacroProfile)
					: ({ ...importedProfile, id: profileId } as UserMacroProfile);
		}
		const extensions =
			bundle.extensions === undefined
				? current.extensions
				: mode === "merge"
					? { ...current.extensions, ...bundle.extensions }
					: { ...bundle.extensions };
		const next = {
			settings: preserveSensitiveSettings(
				bundle.workspace ?? current.settings,
				current.settings,
				this.schema,
			),
			profiles,
			extensions,
		};
		try {
			const revision = await this.bundle.save(next, expectedRevision);
			this.bundleRevision = revision;
			await this.reload();
			return {
				status: "saved",
				restartRequired: false,
				settingsRevision: revision,
			};
		} catch (error) {
			if (error instanceof SettingsBundleConflictError)
				return {
					status: "conflict",
					expectedRevision: error.expectedRevision,
					actualRevision: error.actualRevision,
				};
			throw error;
		}
	}
	getSchema(): readonly SettingsSchemaEntry[] {
		return this.schema;
	}
	getPath(path: readonly string[]): unknown {
		return getAtPath(this.draft, path);
	}
	isDirty(): boolean {
		return this.rawText !== JSON.stringify(this.effective, null, 2);
	}

	reconfigure(model: {
		readonly defaults?: Readonly<Record<string, unknown>>;
		readonly schema?: readonly SettingsSchemaEntry[];
	}): void {
		if (model.defaults) {
			this.defaults = mergeMissing(
				model.defaults as Record<string, unknown>,
				this.coreDefaults,
			);
			this.effective = mergeMissing(this.effective, model.defaults);
			this.draft = mergeMissing(this.draft, model.defaults);
			this.rawText = JSON.stringify(this.draft, null, 2);
		}
		if (model.schema) {
			this.schema = [...this.coreSchema, ...model.schema];
		}
		this.validate();
		this.notify();
	}

	setPath(path: readonly string[], value: unknown): void {
		const next = clone(this.draft);
		setAtPath(next, path, value);
		this.draft = next;
		this.rawText = JSON.stringify(next, null, 2);
		this.validate();
		this.notify();
	}

	replaceRawText(text: string): void {
		this.rawText = text;
		try {
			const parsed = JSON.parse(text);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				this.rawParseValid = false;
				this.diagnostics = [
					{
						severity: "error",
						message: "Settings root must be a JSON object.",
					},
				];
			} else {
				this.rawParseValid = true;
				this.draft = parsed as Record<string, unknown>;
				this.validate();
			}
		} catch (error) {
			this.rawParseValid = false;
			this.diagnostics = [
				{
					severity: "error",
					message: error instanceof Error ? error.message : String(error),
				},
			];
		}
		this.notify();
	}

	validate(): readonly SettingsDiagnostic[] {
		if (!this.rawParseValid) return this.diagnostics;
		const diagnostics: SettingsDiagnostic[] = [];
		for (const entry of this.schema) {
			const value = getAtPath(this.draft, entry.path);
			if (value === undefined) continue;
			const allowedEnumValues =
				entry.enumValues ?? entry.enumOptions?.map((opt) => opt.id);
			if (
				!matchesType(value, entry.type) ||
				(entry.type === "enum" &&
					allowedEnumValues &&
					!allowedEnumValues.includes(String(value)))
			) {
				diagnostics.push({
					severity: "error",
					path: entry.path,
					message: `Invalid value for ${entry.path.join(".")}.`,
					restartRequired: entry.restartRequired,
				});
				continue;
			}
			if (
				typeof value === "number" &&
				((entry.min !== undefined && value < entry.min) ||
					(entry.max !== undefined && value > entry.max))
			)
				diagnostics.push({
					severity: "error",
					path: entry.path,
					message: `Value for ${entry.path.join(".")} is outside its allowed range.`,
					restartRequired: entry.restartRequired,
				});
		}
		this.diagnostics = [
			...diagnostics,
			...(this.options.customValidate?.(this.draft) ?? []),
		];
		return this.diagnostics;
	}

	getActiveProfileId(): string {
		return this.activeProfileId;
	}

	async listProfiles(): Promise<readonly string[]> {
		if (this.driver) {
			const list = await this.driver.listProfiles();
			if (!list.includes(this.activeProfileId)) {
				return Object.freeze([this.activeProfileId, ...list]);
			}
			return list;
		}
		return Object.freeze([this.activeProfileId]);
	}

	async switchProfile(id: string): Promise<void> {
		this.activeProfileId = id;
		if (this.driver) {
			const resolved = await resolveProfile(id, this.driver, this.baseProfile);
			this.effective = clone({
				...this.defaults,
				...(resolved as Record<string, unknown>),
			});
			this.draft = clone(this.effective);
			this.rawText = JSON.stringify(this.draft, null, 2);
			this.validate();
			this.notify();
		}
		if (this.bundle) {
			this.bundleRevision = await this.loadBundleRevision();
		}
	}

	async save(expectedRevision?: string): Promise<SettingsSaveResult> {
		const diagnostics = this.validate();
		if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
			return { status: "blocked", diagnostics };

		if (this.bundle) {
			await this.ensureBundleRevision();
			const bundle = await this.buildBundle();
			try {
				const revision = await this.bundle.save(
					bundle,
					expectedRevision ?? this.bundleRevision,
				);
				this.bundleRevision = revision;
			} catch (error) {
				if (error instanceof SettingsBundleConflictError) {
					return {
						status: "conflict",
						expectedRevision: error.expectedRevision,
						actualRevision: error.actualRevision,
					};
				}
				throw error;
			}
		} else if (this.driver) {
			// Legacy driver-only path: preserve existing behavior through the
			// same canonical service contract.
			await this.writeDriver(this.draft);
		}

		if (this.options.storage) {
			await this.options.storage.write(this.rawText);
		}

		const restartRequired = diagnostics.some(
			(diagnostic) => diagnostic.restartRequired === true,
		);
		this.effective = clone(this.draft);
		this.notify();
		return {
			status: "saved",
			restartRequired,
			settingsRevision: this.bundleRevision,
		};
	}

	private async buildBundle(): Promise<
		Omit<SettingsBundleSnapshot, "revision">
	> {
		const settings = await this.buildWorkspaceSettings(this.draft);
		const profiles: Record<string, UserMacroProfile> = {};
		if (this.driver) {
			const profileSubset = this.buildProfileSubset(this.draft);
			const delta = computeSparseDelta(profileSubset, this.baseProfile ?? {});
			profiles[this.activeProfileId] = {
				...delta,
				id: this.activeProfileId,
			} as UserMacroProfile;
		}
		const extensions: Record<string, Record<string, unknown>> = {};
		if (this.draft.extensions && typeof this.draft.extensions === "object") {
			for (const [extId, extConfig] of Object.entries(
				this.draft.extensions as Record<string, unknown>,
			)) {
				if (extConfig && typeof extConfig === "object") {
					extensions[extId] = extConfig as Record<string, unknown>;
				}
			}
		}
		return { settings, profiles, extensions };
	}

	private async writeDriver(
		draft: Readonly<Record<string, unknown>>,
	): Promise<void> {
		if (!this.driver) return;
		const settings = await this.buildWorkspaceSettings(draft);
		await this.driver.saveSettings(settings);

		const profileSubset = this.buildProfileSubset(draft);
		const delta = computeSparseDelta(profileSubset, this.baseProfile ?? {});
		await this.driver.saveProfile(this.activeProfileId, delta);

		if (draft.extensions && typeof draft.extensions === "object") {
			for (const [extId, extConfig] of Object.entries(
				draft.extensions as Record<string, unknown>,
			)) {
				if (extConfig && typeof extConfig === "object") {
					await this.driver.saveExtensionConfig(
						extId,
						extConfig as Record<string, unknown>,
					);
				}
			}
		}
	}

	private buildWorkspaceSettings(
		draft: Readonly<Record<string, unknown>>,
	): Promise<WorkspaceSettings> {
		const appearance = (draft.appearance ?? {}) as Record<string, unknown>;
		const editor = (draft.editor ?? {}) as Record<string, unknown>;
		return Promise.resolve({
			activeProfile: this.activeProfileId,
			uiLocale: draft.uiLocale as string | undefined,
			theme: appearance.theme as string | undefined,
			showBounds: appearance.showBounds as boolean | undefined,
			...appearance,
			...editor,
		});
	}

	private buildProfileSubset(
		draft: Readonly<Record<string, unknown>>,
	): UserMacroProfile {
		return {
			locale: draft.locale as string | undefined,
			syntax: draft.syntax as any,
			values: draft.values as any,
			unitAliases: draft.unitAliases as any,
			rangeDelimiters: draft.rangeDelimiters as any,
			operatorAliases: draft.operatorAliases as any,
			statisticalAliases: draft.statisticalAliases as any,
			excludePrefixes: draft.excludePrefixes as any,
			numberWords: draft.numberWords as any,
			localization: draft.localization as any,
		};
	}

	private async loadBundleRevision(): Promise<string> {
		if (!this.bundle) return "";
		const snapshot = await this.bundle.load();
		return snapshot.revision;
	}

	private async ensureBundleRevision(): Promise<void> {
		if (this.bundleRevisionLoad) {
			this.bundleRevision = await this.bundleRevisionLoad;
			this.bundleRevisionLoad = undefined;
		}
		if (!this.bundleRevision) {
			this.bundleRevision = await this.loadBundleRevision();
		}
	}

	async reset(): Promise<void> {
		if (this.options.storage) {
			await this.options.storage.reset();
		}
		this.draft = clone(this.defaults);
		this.effective = clone(this.draft);
		this.rawText = JSON.stringify(this.draft, null, 2);
		this.diagnostics = [];
		this.rawParseValid = true;
		this.notify();
	}

	async reload(): Promise<void> {
		if (this.driver) {
			await this.switchProfile(this.activeProfileId);
			return;
		}
		if (this.options.storage) {
			const raw = await this.options.storage.read();
			if (raw === null) return this.reset();
			this.replaceRawText(raw);
			if (
				!this.diagnostics.some((diagnostic) => diagnostic.severity === "error")
			) {
				this.effective = clone(this.draft);
				this.notify();
			}
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function clone<T>(value: T): T {
	return structuredClone(value);
}
function mergeMissing(
	target: Record<string, unknown>,
	defaults: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const result = clone(target);
	for (const [key, value] of Object.entries(defaults)) {
		if (result[key] === undefined) result[key] = clone(value);
		else if (isRecord(result[key]) && isRecord(value))
			result[key] = mergeMissing(result[key], value);
	}
	return result;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function getAtPath(
	value: Record<string, unknown>,
	path: readonly string[],
): unknown {
	return path.reduce<unknown>(
		(current, key) =>
			current && typeof current === "object"
				? (current as Record<string, unknown>)[key]
				: undefined,
		value,
	);
}
function setAtPath(
	root: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let current = root;
	for (const key of path.slice(0, -1)) {
		const child = current[key];
		current[key] =
			child && typeof child === "object" && !Array.isArray(child) ? child : {};
		current = current[key] as Record<string, unknown>;
	}
	if (path.length > 0) current[path[path.length - 1]!] = value;
}

function preserveSensitiveSettings(
	imported: WorkspaceSettings,
	current: WorkspaceSettings,
	schema: readonly SettingsSchemaEntry[],
): WorkspaceSettings {
	const result = clone(imported) as Record<string, unknown>;
	for (const entry of schema) {
		if (!entry.sensitive) continue;
		const importedValue = getAtPath(result, entry.path);
		const currentValue = getAtPath(current, entry.path);
		if (
			importedValue === undefined ||
			importedValue === SETTINGS_REDACTION_MARKER
		) {
			setAtPath(result, entry.path, currentValue);
		}
	}
	return result as WorkspaceSettings;
}
function matchesType(
	value: unknown,
	type: SettingsSchemaEntry["type"],
): boolean {
	return (
		type === "json" ||
		(type === "boolean" && typeof value === "boolean") ||
		(type === "number" && typeof value === "number") ||
		(type === "string" && typeof value === "string") ||
		(type === "enum" && typeof value === "string") ||
		(type === "array" && Array.isArray(value)) ||
		(type === "object" &&
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)) ||
		(type === "keymap" && typeof value === "object" && value !== null)
	);
}
