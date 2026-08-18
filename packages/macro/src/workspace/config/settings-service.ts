import type { UserMacroProfile } from "../../contracts/extension-config";
import { computeSparseDelta, resolveProfile } from "./profile-resolver";
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
	| { readonly status: "saved"; readonly restartRequired: boolean }
	| {
			readonly status: "blocked";
			readonly diagnostics: readonly SettingsDiagnostic[];
	  };

export interface SettingsStorage {
	read(): Promise<string | null> | string | null;
	write(content: string): Promise<void> | void;
	reset(): Promise<void> | void;
}

export interface WorkspaceSettingsServiceOptions {
	readonly defaults: Readonly<Record<string, unknown>>;
	readonly initial?: Readonly<Record<string, unknown>>;
	readonly schema?: readonly SettingsSchemaEntry[];
	readonly storage?: SettingsStorage;
	readonly driver?: SettingsStorageDriver;
	readonly activeProfileId?: string;
	readonly baseProfile?: UserMacroProfile;
	readonly customValidate?: (
		draft: Readonly<Record<string, unknown>>,
	) => readonly SettingsDiagnostic[];
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

	constructor(private readonly options: WorkspaceSettingsServiceOptions) {
		this.coreDefaults = options.defaults;
		this.coreSchema = options.schema ?? [];
		this.defaults = options.defaults;
		this.schema = options.schema ?? [];
		this.activeProfileId = options.activeProfileId ?? "base";
		this.baseProfile = options.baseProfile;
		this.driver = options.driver;
		this.effective = clone(options.initial ?? options.defaults);
		this.draft = clone(this.effective);
		this.rawText = JSON.stringify(this.draft, null, 2);
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
	}

	async save(): Promise<SettingsSaveResult> {
		const diagnostics = this.validate();
		if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
			return { status: "blocked", diagnostics };

		if (this.driver) {
			// 1. Profile-scoped state
			const profileSubset: UserMacroProfile = {
				locale: this.draft.locale as string | undefined,
				syntax: this.draft.syntax as any,
				values: this.draft.values as any,
				unitAliases: this.draft.unitAliases as any,
				rangeDelimiters: this.draft.rangeDelimiters as any,
				operatorAliases: this.draft.operatorAliases as any,
				statisticalAliases: this.draft.statisticalAliases as any,
				excludePrefixes: this.draft.excludePrefixes as any,
				numberWords: this.draft.numberWords as any,
				localization: this.draft.localization as any,
			};
			const delta = computeSparseDelta(profileSubset, this.baseProfile ?? {});
			await this.driver.saveProfile(this.activeProfileId, delta);

			// 2. Workspace-scoped state
			const appearance = (this.draft.appearance ?? {}) as Record<
				string,
				unknown
			>;
			const editor = (this.draft.editor ?? {}) as Record<string, unknown>;
			const workspaceSettings: WorkspaceSettings = {
				activeProfile: this.activeProfileId,
				theme: appearance.theme as string | undefined,
				showBounds: appearance.showBounds as boolean | undefined,
				...appearance,
				...editor,
			};
			await this.driver.saveSettings(workspaceSettings);

			// 3. Extension-scoped configs
			if (this.draft.extensions && typeof this.draft.extensions === "object") {
				for (const [extId, extConfig] of Object.entries(
					this.draft.extensions as Record<string, unknown>,
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

		if (this.options.storage) {
			await this.options.storage.write(this.rawText);
		}

		const restartRequired = diagnostics.some(
			(diagnostic) => diagnostic.restartRequired === true,
		);
		this.effective = clone(this.draft);
		this.notify();
		return { status: "saved", restartRequired };
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
