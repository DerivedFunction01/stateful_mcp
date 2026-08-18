import type {
	SettingsDiagnostic,
	SettingsSchemaEntry,
	WorkspaceSettingsService,
} from "./settings-service";

export type SettingsScope = "user" | "workspace" | "folder";

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

export interface SettingsUiSection {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly items: readonly SettingsUiItem[];
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

	constructor(private readonly service: WorkspaceSettingsService) {
		this.service.subscribe(() => this.notify());
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

		const sectionMap = new Map<string, SettingsUiItem[]>();
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
				if (!matchTitle && !matchDesc && !matchPath) {
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

			const category = entry.path[0] ?? "general";
			const items = sectionMap.get(category) ?? [];
			items.push(item);
			sectionMap.set(category, items);
		}

		const sections: SettingsUiSection[] = [];
		for (const [cat, items] of sectionMap.entries()) {
			sections.push({
				id: cat,
				title: formatCategoryTitle(cat),
				category: cat,
				items: Object.freeze(items),
			});
		}

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

function formatCategoryTitle(category: string): string {
	switch (category) {
		case "syntax":
			return "Core Syntax";
		case "values":
			return "Fundamentals & Values";
		case "appearance":
			return "Appearance & Theme";
		case "editor":
			return "Editor Configuration";
		case "keymap":
			return "Keybindings & Motions";
		default:
			return category.charAt(0).toUpperCase() + category.slice(1);
	}
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
