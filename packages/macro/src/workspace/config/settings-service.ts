export interface SettingsSchemaEntry {
	readonly path: readonly string[];
	readonly type: "boolean" | "number" | "string" | "enum" | "json" | "keymap";
	readonly title: string;
	readonly description?: string;
	readonly enumValues?: readonly string[];
	readonly min?: number;
	readonly max?: number;
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
	readonly storage: SettingsStorage;
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
	private defaults: Readonly<Record<string, unknown>>;
	private schema: readonly SettingsSchemaEntry[];

	constructor(private readonly options: WorkspaceSettingsServiceOptions) {
		this.coreDefaults = options.defaults;
		this.defaults = options.defaults;
		this.schema = options.schema ?? [];
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
		if (model.schema) this.schema = model.schema;
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
			if (
				!matchesType(value, entry.type) ||
				(entry.type === "enum" && !entry.enumValues?.includes(String(value)))
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

	async save(): Promise<SettingsSaveResult> {
		const diagnostics = this.validate();
		if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
			return { status: "blocked", diagnostics };
		await this.options.storage.write(this.rawText);
		const restartRequired = diagnostics.some(
			(diagnostic) => diagnostic.restartRequired === true,
		);
		this.effective = clone(this.draft);
		this.notify();
		return { status: "saved", restartRequired };
	}

	async reset(): Promise<void> {
		await this.options.storage.reset();
		this.draft = clone(this.defaults);
		this.effective = clone(this.draft);
		this.rawText = JSON.stringify(this.draft, null, 2);
		this.diagnostics = [];
		this.rawParseValid = true;
		this.notify();
	}

	async reload(): Promise<void> {
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
		(type === "keymap" && typeof value === "object" && value !== null)
	);
}
