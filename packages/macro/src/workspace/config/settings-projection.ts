import {
	SETTINGS_REDACTION_MARKER,
	type SettingsUiSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import type { I18nKernel } from "../i18n/i18n-kernel";
import { EN_LOCALE } from "../i18n/locales/en";
import type {
	SettingsDiagnostic,
	SettingsSchemaEntry,
} from "./settings-service";
import type {
	SettingsOriginInfo,
	SettingsScope,
	SettingsUiItem,
	SettingsUiSnapshot,
} from "./settings-ui-model";

export const SUPPORTED_SETTINGS_SCOPES: readonly SettingsScope[] = [
	"workspace",
];

export const UNSUPPORTED_SCOPE_REASONS: Record<SettingsScope, string> = {
	user: "settings.scope.user.unsupported",
	folder: "settings.scope.folder.unsupported",
	workspace: "",
};

export interface SettingsUiProjectionOptions {
	readonly activeScope?: SettingsScope;
	readonly supportedScopes?: readonly SettingsScope[];
	readonly i18n?: I18nKernel;
	readonly settingsRevision?: string;
}

export interface SerializedSettingsUiItem {
	readonly path: readonly string[];
	readonly schema: SettingsSchemaEntry;
	readonly value: unknown;
	readonly effectiveValue: unknown;
	readonly isModified: boolean;
	readonly origin: {
		readonly kind: SettingsOriginInfo["kind"];
		readonly sourceProfileId?: string;
		readonly appendedCount?: number;
		readonly description: string;
	};
	readonly diagnostics: readonly {
		readonly severity: SettingsDiagnostic["severity"];
		readonly path?: readonly string[];
		readonly message: string;
		readonly line?: number;
		readonly column?: number;
		readonly restartRequired?: boolean;
	}[];
}

export interface SerializedSettingsUiSection {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly icon?: string;
	readonly description?: string;
	readonly order?: number;
	readonly items: readonly SerializedSettingsUiItem[];
	readonly groups: readonly {
		readonly id: string;
		readonly title: string;
		readonly description?: string;
		readonly order?: number;
		readonly items: readonly SerializedSettingsUiItem[];
	}[];
}

/**
 * Renderer-neutral serialization of `SettingsUiModel.getSnapshot()` for the
 * protocol. This helper is the single boundary between the canonical Macro
 * settings UI model and any renderer (browser, terminal, future client).
 *
 * It performs two projection duties the browser must never do itself:
 * 1. **Sensitive redaction** - replace secret values with a stable masked
 *    marker and report whether JSON mode is disabled for the active scope.
 * 2. **Scope capability advertisement** - the host decides which scopes are
 *    selectable; the browser never hard-codes persistence authority.
 */
export function serializeSettingsUiSnapshot(
	snapshot: SettingsUiSnapshot,
	options: SettingsUiProjectionOptions = {},
): SettingsUiSnapshotDto {
	const activeScope = options.activeScope ?? snapshot.activeScope;
	const supportedScopes = (
		options.supportedScopes ?? SUPPORTED_SETTINGS_SCOPES
	).slice();
	const unsupportedScopeReason =
		supportedScopes.includes(activeScope) || activeScope === "workspace"
			? undefined
			: (UNSUPPORTED_SCOPE_REASONS[activeScope] ??
				"settings.scope.unsupported");

	const sections = snapshot.sections.map((section) => ({
		id: section.id,
		title: section.title,
		category: section.category,
		icon: section.icon,
		description: section.description,
		order: section.order,
		groups: section.groups.map((group) => ({
			id: group.id,
			title: group.title,
			description: group.description,
			order: group.order,
			items: group.items.map((item) =>
				serializeItem(item, activeScope, supportedScopes),
			),
		})),
		items: section.items.map((item) =>
			serializeItem(item, activeScope, supportedScopes),
		),
	}));

	const jsonModeAvailable = supportedScopes.includes(activeScope);
	const hasSensitiveEntries = sections.some((section) =>
		[...section.items, ...section.groups.flatMap((group) => group.items)].some(
			(item) => item.schema.sensitive === true,
		),
	);

	return {
		activeProfileId: snapshot.activeProfileId,
		availableProfiles: snapshot.availableProfiles ?? [],
		activeScope,
		supportedScopes,
		unsupportedScopeReason,
		searchQuery: snapshot.searchQuery,
		filterModifiedOnly: snapshot.filterModifiedOnly,
		isSplitJsonMode: snapshot.isSplitJsonMode,
		jsonModeAvailable: jsonModeAvailable && !hasSensitiveEntries,
		modifiedCount: snapshot.totalModifiedCount,
		totalModifiedCount: snapshot.totalModifiedCount,
		sections,
		rawJsonText: hasSensitiveEntries
			? redactRawJson(snapshot.rawJsonText, sections)
			: snapshot.rawJsonText,
		hasErrors: snapshot.hasErrors,
		settingsRevision: options.settingsRevision ?? "",
	};
}

function redactRawJson(
	rawText: string,
	sections: readonly SerializedSettingsUiSection[],
): string {
	const sensitivePaths = sections
		.flatMap((section) => [
			...section.items,
			...section.groups.flatMap((group) => group.items),
		])
		.filter((item) => item.schema.sensitive === true)
		.map((item) => item.path);
	try {
		const parsed = JSON.parse(rawText) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return "[sensitive settings omitted]";
		}
		const redacted = structuredClone(parsed) as Record<string, unknown>;
		for (const path of sensitivePaths) setAtPath(redacted, path, MASKED_VALUE);
		return JSON.stringify(redacted, null, 2);
	} catch {
		return "[sensitive settings omitted]";
	}
}

function setAtPath(
	target: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let cursor = target;
	for (const key of path.slice(0, -1)) {
		if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	const leaf = path[path.length - 1];
	if (leaf) cursor[leaf] = value;
}

function serializeItem(
	item: SettingsUiItem,
	activeScope: SettingsScope,
	supportedScopes: readonly SettingsScope[],
): SerializedSettingsUiItem {
	const redacted = item.schema.sensitive ? redactItem(item, activeScope) : item;
	return {
		path: item.schema.path,
		schema: {
			path: item.schema.path,
			type: item.schema.type,
			title: item.schema.title,
			description: item.schema.description,
			widget: item.schema.widget,
			category: item.schema.category,
			group: item.schema.group,
			order: item.schema.order,
			placeholder: item.schema.placeholder,
			enumValues: item.schema.enumValues,
			enumOptions: item.schema.enumOptions,
			min: item.schema.min,
			max: item.schema.max,
			step: item.schema.step,
			tagDelimiters: item.schema.tagDelimiters,
			customWidgetId: item.schema.customWidgetId,
			restartRequired: item.schema.restartRequired,
			sensitive: item.schema.sensitive,
		},
		value: redacted.value,
		effectiveValue: redacted.effectiveValue,
		isModified: redacted.isModified,
		origin: serializeOrigin(redacted.origin),
		diagnostics: redacted.diagnostics.map(serializeDiagnostic),
	};
}

function redactItem(
	item: SettingsUiItem,
	_scope: SettingsScope,
): SettingsUiItem {
	if (!item.schema.sensitive) return item;
	return {
		...item,
		value: MASKED_VALUE,
		effectiveValue: MASKED_VALUE,
	};
}

function serializeOrigin(origin: SettingsOriginInfo): {
	readonly kind: SettingsOriginInfo["kind"];
	readonly sourceProfileId?: string;
	readonly appendedCount?: number;
	readonly description: string;
} {
	return {
		kind: origin.kind,
		sourceProfileId: origin.sourceProfileId,
		appendedCount: origin.appendedCount,
		description: origin.description,
	};
}

function serializeDiagnostic(diagnostic: SettingsDiagnostic): {
	readonly severity: SettingsDiagnostic["severity"];
	readonly code?: string;
	readonly path?: readonly string[];
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly restartRequired?: boolean;
} {
	return {
		severity: diagnostic.severity,
		code: diagnostic.code,
		path: diagnostic.path,
		message: diagnostic.message,
		line: diagnostic.line,
		column: diagnostic.column,
		restartRequired: diagnostic.restartRequired,
	};
}

export function tScopeUnsupported(
	i18n: I18nKernel | undefined,
	scope: SettingsScope,
): string {
	const key: string =
		UNSUPPORTED_SCOPE_REASONS[scope] ?? "settings.scope.unsupported";
	return i18n ? i18n.t(key) : ((EN_LOCALE as Record<string, string>)[key] ?? key);
}

export function tCategory(
	i18n: I18nKernel | undefined,
	category: string,
): string {
	const key = `settings.category.${category}`;
	const translated = i18n
		? i18n.t(key)
		: (EN_LOCALE as Record<string, string>)[key];
	return translated && translated !== key ? translated : toTitleCase(category);
}

function toTitleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export const MASKED_VALUE = SETTINGS_REDACTION_MARKER;

export function isSensitiveEntry(
	schema: SettingsSchemaEntry,
	value: unknown,
): boolean {
	return schema.sensitive === true && value !== undefined && value !== null;
}

export function isKeymapUnsupported(schema: SettingsSchemaEntry): boolean {
	return schema.type === "keymap" || schema.widget === "keymap";
}

export function isCustomWidgetUnsupported(
	schema: SettingsSchemaEntry,
): boolean {
	return schema.widget === "custom" && !schema.customWidgetId;
}
