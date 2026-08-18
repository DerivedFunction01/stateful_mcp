import type { I18nKernel } from "../i18n/i18n-kernel";
import { EN_LOCALE } from "../i18n/locales/en";
import type {
	SettingsDiagnostic,
	SettingsSchemaEntry,
	WorkspaceSettingsService,
} from "./settings-service";

export type SettingsScope = "user" | "workspace" | "folder";

export const CORE_SETTINGS_CATEGORIES = [
	"syntax",
	"values",
	"appearance",
	"editor",
	"keymap",
	"extensions",
] as const;

export type CoreSettingsCategory = (typeof CORE_SETTINGS_CATEGORIES)[number];
export type SettingsCategory = CoreSettingsCategory | (string & {});

export const CORE_CATEGORY_ORDER: Readonly<Record<string, number>> = {
	syntax: 10,
	values: 20,
	appearance: 30,
	editor: 40,
	keymap: 50,
	extensions: 60,
};

export type SettingsOriginKind =
	| "default"
	| "inherited"
	| "appended"
	| "overridden";

export interface SettingsOriginInfo {
	readonly kind: SettingsOriginKind;
	readonly sourceProfileId?: string;
	readonly appendedCount?: number;
	readonly description: string;
}

export interface SettingsUiItem {
	readonly schema: SettingsSchemaEntry;
	readonly value: unknown;
	readonly effectiveValue: unknown;
	readonly isModified: boolean;
	readonly origin: SettingsOriginInfo;
	readonly diagnostics: readonly SettingsDiagnostic[];
}

export interface SettingsUiGroup {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly order?: number;
	readonly items: readonly SettingsUiItem[];
}

export interface SettingsUiSection {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly icon?: string;
	readonly description?: string;
	readonly order?: number;
	readonly items: readonly SettingsUiItem[];
	readonly groups: readonly SettingsUiGroup[];
}

export interface SettingsUiSnapshot {
	readonly activeProfileId: string;
	readonly activeScope: SettingsScope;
	readonly searchQuery: string;
	readonly filterModifiedOnly: boolean;
	readonly isSplitJsonMode: boolean;
	readonly sections: readonly SettingsUiSection[];
	readonly totalModifiedCount: number;
	readonly rawJsonText: string;
	readonly hasErrors: boolean;
}

export class SettingsUiModel {
	private activeProfileId = "base";
	private activeScope: SettingsScope = "workspace";
	private searchQuery = "";
	private filterModifiedOnly = false;
	private isSplitJsonMode = false;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly service: WorkspaceSettingsService,
		private readonly i18n?: I18nKernel,
	) {
		this.service.subscribe(() => this.notify());
		this.i18n?.subscribe(() => this.notify());
	}

	getActiveProfileId(): string {
		return this.activeProfileId;
	}

	setActiveProfileId(profileId: string): void {
		if (this.activeProfileId !== profileId) {
			this.activeProfileId = profileId;
			this.notify();
		}
	}

	getActiveScope(): SettingsScope {
		return this.activeScope;
	}

	setActiveScope(scope: SettingsScope): void {
		if (this.activeScope !== scope) {
			this.activeScope = scope;
			this.notify();
		}
	}

	getSearchQuery(): string {
		return this.searchQuery;
	}

	setSearchQuery(query: string): void {
		this.searchQuery = query;
		this.notify();
	}

	getFilterModifiedOnly(): boolean {
		return this.filterModifiedOnly;
	}

	setFilterModifiedOnly(enabled: boolean): void {
		this.filterModifiedOnly = enabled;
		this.notify();
	}

	getIsSplitJsonMode(): boolean {
		return this.isSplitJsonMode;
	}

	toggleSplitJsonMode(): void {
		this.isSplitJsonMode = !this.isSplitJsonMode;
		this.notify();
	}

	setValue(path: readonly string[], value: unknown): void {
		this.service.setPath(path, value);
	}

	resetValue(path: readonly string[]): void {
		// Reset to default
		const schemaEntry = this.service
			.getSchema()
			.find((s) => s.path.join(".") === path.join("."));
		if (schemaEntry) {
			const effective = this.service.getEffective();
			const defaultVal = getAtPath(effective as Record<string, unknown>, path);
			this.service.setPath(path, defaultVal);
		}
	}

	replaceRawJson(text: string): void {
		this.service.replaceRawText(text);
	}

	getSnapshot(): SettingsUiSnapshot {
		const schema = this.service.getSchema();
		const draft = this.service.getDraft();
		const effective = this.service.getEffective();
		const diagnostics = this.service.getDiagnostics();
		const query = this.searchQuery.trim().toLowerCase();

		const sectionItemMap = new Map<string, SettingsUiItem[]>();
		let totalModified = 0;

		for (const entry of schema) {
			const pathStr = entry.path.join(".");
			const value = getAtPath(draft, entry.path);
			const effectiveVal = getAtPath(effective, entry.path);
			const isModified = JSON.stringify(value) !== JSON.stringify(effectiveVal);

			if (isModified) {
				totalModified++;
			}

			if (this.filterModifiedOnly && !isModified) {
				continue;
			}

			if (query) {
				const matchTitle = entry.title.toLowerCase().includes(query);
				const matchDesc = entry.description?.toLowerCase().includes(query);
				const matchPath = pathStr.toLowerCase().includes(query);
				const matchGroup = entry.group?.toLowerCase().includes(query);
				const matchCategory = entry.category?.toLowerCase().includes(query);
				const matchOptions = entry.enumValues?.some((v) =>
					v.toLowerCase().includes(query),
				);
				if (
					!matchTitle &&
					!matchDesc &&
					!matchPath &&
					!matchGroup &&
					!matchCategory &&
					!matchOptions
				) {
					continue;
				}
			}

			const itemDiagnostics = diagnostics.filter(
				(d) => d.path?.join(".") === pathStr,
			);

			const origin: SettingsOriginInfo = isModified
				? {
						kind: "overridden",
						sourceProfileId: this.activeProfileId,
						description: `Overridden in ${this.activeProfileId}`,
					}
				: {
						kind: "inherited",
						sourceProfileId: "base",
						description: "Inherited from Base",
					};

			const item: SettingsUiItem = {
				schema: entry,
				value,
				effectiveValue: effectiveVal,
				isModified,
				origin,
				diagnostics: itemDiagnostics,
			};

			const category =
				entry.category ??
				(entry.path[0] === "extensions" && entry.path[1]
					? entry.path[1]
					: (entry.path[0] ?? "general"));
			const items = sectionItemMap.get(category) ?? [];
			items.push(item);
			sectionItemMap.set(category, items);
		}

		const sections: SettingsUiSection[] = [];
		for (const [cat, items] of sectionItemMap.entries()) {
			// Sort items by entry.order or keep schema insertion order
			const sortedItems = [...items].sort((a, b) => {
				const orderA = a.schema.order ?? 100;
				const orderB = b.schema.order ?? 100;
				return orderA - orderB;
			});

			// Group items within section by group
			const groupMap = new Map<string, SettingsUiItem[]>();
			for (const it of sortedItems) {
				const grpName = it.schema.group ?? "General";
				const grpItems = groupMap.get(grpName) ?? [];
				grpItems.push(it);
				groupMap.set(grpName, grpItems);
			}

			const groups: SettingsUiGroup[] = [];
			for (const [grpTitle, grpItems] of groupMap.entries()) {
				groups.push({
					id: grpTitle.toLowerCase().replace(/\s+/g, "-"),
					title: grpTitle,
					items: Object.freeze(grpItems),
				});
			}

			const sectionOrder = CORE_CATEGORY_ORDER[cat] ?? 100;
			sections.push({
				id: cat,
				title: formatCategoryTitle(cat, this.i18n),
				category: cat,
				order: sectionOrder,
				items: Object.freeze(sortedItems),
				groups: Object.freeze(groups),
			});
		}

		// Sort sections by order
		sections.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

		return {
			activeProfileId: this.activeProfileId,
			activeScope: this.activeScope,
			searchQuery: this.searchQuery,
			filterModifiedOnly: this.filterModifiedOnly,
			isSplitJsonMode: this.isSplitJsonMode,
			sections: Object.freeze(sections),
			totalModifiedCount: totalModified,
			rawJsonText: this.service.getRawText(),
			hasErrors: diagnostics.some((d) => d.severity === "error"),
		};
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

export function formatCategoryTitle(
	category: string,
	i18n?: I18nKernel,
): string {
	const key = `settings.category.${category}`;
	const translated: string | undefined = i18n ? i18n.t(key) : EN_LOCALE[key];
	if (translated && translated !== key) {
		return translated;
	}
	// Dynamic extension categories without dictionary entries fall back to
	// algorithmic capitalization.
	return category.charAt(0).toUpperCase() + category.slice(1);
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
