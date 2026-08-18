import type {
	I18nKernel,
	SettingsCategory,
	SettingsDiagnostic,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro";

export interface SettingsModule<T = unknown> {
	/** Unique module identifier (e.g. "values.frequency", "syntax", "editor") */
	readonly id: string;
	/** Primary category grouping in the Settings TUI navigation sidebar */
	readonly category: SettingsCategory;
	/** Section title grouping inside the category view */
	readonly group: string;
	/** The nested path in the settings tree where this module's config resides (e.g. ["values", "frequency"]) */
	readonly rootPath: readonly string[];
	/** Default configuration object for this domain */
	readonly defaultValues: T;
	/** Factory producing schema entries with localized titles/descriptions via i18n */
	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[];
	/** Real-time validation hook executed on draft modifications */
	validate?(
		moduleDraft: Partial<T> | undefined,
		rootDraft: Readonly<Record<string, unknown>>,
	): readonly SettingsDiagnostic[];
	/** Optional transformation hook compiling settings into runtime engine configs */
	compile?(moduleValues: T): unknown;
}

export class CompositeSettingsRegistry {
	private readonly modules = new Map<string, SettingsModule<any>>();

	register<T>(module: SettingsModule<T>): this {
		if (this.modules.has(module.id)) {
			throw new Error(`Duplicate settings module registered: '${module.id}'`);
		}
		this.modules.set(module.id, module);
		return this;
	}

	getModule(id: string): SettingsModule<any> | undefined {
		return this.modules.get(id);
	}

	getAllModules(): readonly SettingsModule<any>[] {
		return Array.from(this.modules.values());
	}

	/**
	 * Constructs the deep default settings tree by nesting each module's defaultValues under its rootPath.
	 */
	getDefaults(): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const module of this.modules.values()) {
			setDeepValue(result, module.rootPath, cloneDeep(module.defaultValues));
		}
		return result;
	}

	/**
	 * Concatenates schema entries from all modules, localized via the given i18n kernel.
	 */
	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		const entries: SettingsSchemaEntry[] = [];
		for (const module of this.modules.values()) {
			entries.push(...module.getSchema(i18n));
		}
		return entries;
	}

	/**
	 * Runs validation across all registered modules and aggregates diagnostics.
	 */
	validate(
		rootDraft: Readonly<Record<string, unknown>>,
	): readonly SettingsDiagnostic[] {
		const diagnostics: SettingsDiagnostic[] = [];
		for (const module of this.modules.values()) {
			if (module.validate) {
				const moduleDraft = getDeepValue(rootDraft, module.rootPath);
				diagnostics.push(...module.validate(moduleDraft, rootDraft));
			}
		}
		return diagnostics;
	}
}

function setDeepValue(
	target: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	if (path.length === 0) return;
	let current: Record<string, unknown> = target;
	for (let i = 0; i < path.length - 1; i++) {
		const segment = path[i]!;
		if (!current[segment] || typeof current[segment] !== "object") {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}
	current[path[path.length - 1]!] = value;
}

function getDeepValue(
	target: Readonly<Record<string, unknown>>,
	path: readonly string[],
): any {
	let current: any = target;
	for (const segment of path) {
		if (current == null || typeof current !== "object") return undefined;
		current = current[segment];
	}
	return current;
}

function cloneDeep<T>(value: T): T {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((it) => cloneDeep(it)) as unknown as T;
	}
	const copy: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		copy[k] = cloneDeep(v);
	}
	return copy as T;
}
