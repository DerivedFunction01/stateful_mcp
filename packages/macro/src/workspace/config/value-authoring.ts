import type { JsonValue, SettingsScope } from "@stateful-mcp/macro-protocol";
import type {
	CompiledArgumentPolicy,
	MacroArgumentPolicy,
	UserMacroProfile,
} from "../../contracts/extension-config";
import { resolveArgumentPolicy } from "../../extensions/config";
import type {
	AliasDefinition,
	AliasNamespace,
	AliasResolver,
	AliasTarget,
} from "../../values/aliases";
import {
	authoredValueGraphFingerprint,
	compileAuthoredValueGraph,
} from "../../values/authoring";
import type { FundamentalGroup } from "../../values/fundamentals";
import type { ValueRecipe } from "../../values/recipes";
import type { SettingsDiagnostic } from "./settings-service";

/**
 * The persisted settings/wizard model. The value definitions deliberately use
 * the runtime contracts directly; this is not a second grammar model.
 */
export interface ValueAuthoringProfile extends UserMacroProfile {
	readonly id: string;
	readonly label?: string;
	readonly scope?: SettingsScope;
	readonly aliases?: readonly AliasDefinition[];
	/** Resolver implementations are injected at runtime and never persisted. */
	readonly aliasResolvers?: Readonly<Record<string, AliasResolver>>;
	readonly fundamentals?: readonly FundamentalGroup[];
	readonly recipes?: readonly ValueRecipe[];
	readonly argumentPolicies?: Readonly<Record<string, MacroArgumentPolicy>>;
	readonly unitAliases?: UserMacroProfile["unitAliases"];
	readonly localization?: UserMacroProfile["localization"];
	readonly numberWords?: UserMacroProfile["numberWords"];
	readonly values?: UserMacroProfile["values"];
	readonly removedIds?: Readonly<Record<string, readonly string[]>>;
}

export interface ValueAuthoringDraft {
	readonly profile: ValueAuthoringProfile;
	readonly activeDomain?: string;
	readonly selectedGroupId?: string;
	readonly selectedRecipeId?: string;
	readonly revision: string;
	readonly dirty: boolean;
	readonly diagnostics: readonly SettingsDiagnostic[];
	readonly compileStatus: "valid" | "invalid" | "empty";
	readonly graphFingerprint: string;
}

export interface ValueAuthoringValidation {
	readonly valid: boolean;
	readonly diagnostics: readonly SettingsDiagnostic[];
	readonly graphFingerprint: string;
}

export interface CompiledValueAuthoringPolicies {
	readonly policies: Readonly<Record<string, CompiledArgumentPolicy>>;
	readonly diagnostics: readonly SettingsDiagnostic[];
}

/**
 * Resolves a derived profile against its base/parent profile using stable IDs:
 * - Replaces definitions sharing the same stable ID.
 * - Appends definitions with new stable IDs.
 * - Suppresses definitions listed in `removedIds`.
 */
export function resolveEffectiveProfile(
	derived: UserMacroProfile,
	parent?: UserMacroProfile,
): UserMacroProfile {
	if (!parent) return derived;

	const removedIds = derived.removedIds ?? {};
	const removedAliases = new Set(removedIds.aliases ?? []);
	const removedFundamentals = new Set(removedIds.fundamentals ?? []);
	const removedRecipes = new Set(removedIds.recipes ?? []);
	const removedDateTimeFormats = new Set(removedIds.dateTimeFormats ?? []);

	// Merge aliases
	const parentAliases = (parent.aliases ?? []).filter(
		(a) => !removedAliases.has(a.id),
	);
	const derivedAliases = derived.aliases ?? [];
	const aliasMap = new Map<string, AliasDefinition>();
	for (const a of parentAliases) aliasMap.set(a.id, a);
	for (const a of derivedAliases) {
		if (!removedAliases.has(a.id)) {
			aliasMap.set(a.id, a);
		}
	}
	const mergedAliases = Array.from(aliasMap.values());

	// Merge fundamentals
	const parentFundamentals = (parent.fundamentals ?? []).filter(
		(f) => !removedFundamentals.has(f.id),
	);
	const derivedFundamentals = derived.fundamentals ?? [];
	const fundamentalMap = new Map<string, FundamentalGroup>();
	for (const f of parentFundamentals) fundamentalMap.set(f.id, f);
	for (const f of derivedFundamentals) {
		if (!removedFundamentals.has(f.id)) {
			fundamentalMap.set(f.id, f);
		}
	}
	const mergedFundamentals = Array.from(fundamentalMap.values());

	// Merge recipes
	const parentRecipes = (parent.recipes ?? []).filter(
		(r) => !removedRecipes.has(r.id),
	);
	const derivedRecipes = derived.recipes ?? [];
	const recipeMap = new Map<string, ValueRecipe>();
	for (const r of parentRecipes) recipeMap.set(r.id, r);
	for (const r of derivedRecipes) {
		if (!removedRecipes.has(r.id)) {
			recipeMap.set(r.id, r);
		}
	}
	const mergedRecipes = Array.from(recipeMap.values());

	// Merge values.dateTime.formats
	const parentDateTimeFormats = {
		...(parent.values?.dateTime?.formats ?? {}),
	};
	for (const id of removedDateTimeFormats) {
		delete parentDateTimeFormats[id];
	}
	const mergedDateTimeFormats = {
		...parentDateTimeFormats,
		...(derived.values?.dateTime?.formats ?? {}),
	};
	for (const id of removedDateTimeFormats) {
		delete mergedDateTimeFormats[id];
	}

	const mergedValues: UserMacroProfile["values"] = {
		...parent.values,
		...derived.values,
		...(Object.keys(mergedDateTimeFormats).length > 0 ||
		parent.values?.dateTime ||
		derived.values?.dateTime
			? {
					dateTime: {
						...parent.values?.dateTime,
						...derived.values?.dateTime,
						formats: mergedDateTimeFormats,
					},
				}
			: {}),
	};

	return {
		...parent,
		...derived,
		syntax:
			parent.syntax || derived.syntax
				? {
						...parent.syntax,
						...derived.syntax,
					}
				: undefined,
		unitAliases:
			parent.unitAliases || derived.unitAliases
				? {
						...parent.unitAliases,
						...derived.unitAliases,
					}
				: undefined,
		operatorAliases:
			parent.operatorAliases || derived.operatorAliases
				? {
						...parent.operatorAliases,
						...derived.operatorAliases,
					}
				: undefined,
		statisticalAliases:
			parent.statisticalAliases || derived.statisticalAliases
				? {
						...parent.statisticalAliases,
						...derived.statisticalAliases,
					}
				: undefined,
		localization:
			parent.localization || derived.localization
				? {
						...parent.localization,
						...derived.localization,
					}
				: undefined,
		numberWords:
			parent.numberWords || derived.numberWords
				? ({
						...parent.numberWords,
						...derived.numberWords,
					} as UserMacroProfile["numberWords"])
				: undefined,
		aliases: mergedAliases,
		fundamentals: mergedFundamentals,
		recipes: mergedRecipes,
		values: mergedValues,
	};
}

/** Convert the settings model into the profile shape consumed by the compiler. */
export function toAuthoredValueGraph(
	profile: UserMacroProfile,
): UserMacroProfile {
	return profile;
}

export { authoredValueGraphFingerprint };

/** Serialize only JSON-safe authored data; resolver functions are not persisted. */
export function serializeValueAuthoringProfile(
	profile: UserMacroProfile,
): JsonValue {
	const persisted = stripRuntimeResolvers({
		...profile,
		aliases: profile.aliases ?? [],
		fundamentals: profile.fundamentals ?? [],
		recipes: profile.recipes ?? [],
		argumentPolicies: (profile as ValueAuthoringProfile).argumentPolicies ?? {},
	});
	if (!isJsonValue(persisted))
		throw new TypeError("Value authoring profile contains non-JSON data");
	const value = JSON.parse(JSON.stringify(persisted)) as unknown;
	if (!isJsonValue(value))
		throw new TypeError("Value authoring profile contains non-JSON data");
	return value;
}

/** Restore a profile after a protocol/storage round-trip. */
export function deserializeValueAuthoringProfile(
	value: unknown,
): ValueAuthoringProfile {
	if (!isRecord(value) || typeof value.id !== "string")
		throw new TypeError("Invalid value authoring profile: missing id");
	if (!Array.isArray(value.aliases))
		throw new TypeError(
			"Invalid value authoring profile: aliases must be an array",
		);
	if (!Array.isArray(value.fundamentals))
		throw new TypeError(
			"Invalid value authoring profile: fundamentals must be an array",
		);
	if (!Array.isArray(value.recipes))
		throw new TypeError(
			"Invalid value authoring profile: recipes must be an array",
		);
	if (!isRecord(value.argumentPolicies))
		throw new TypeError(
			"Invalid value authoring profile: argumentPolicies must be an object",
		);
	if (value.scope !== undefined && !isSettingsScope(value.scope))
		throw new TypeError("Invalid value authoring profile: invalid scope");
	for (const [index, alias] of value.aliases.entries()) {
		if (
			!isRecord(alias) ||
			typeof alias.id !== "string" ||
			!isAliasNamespace(alias.namespace) ||
			!Array.isArray(alias.spellings) ||
			!alias.spellings.every((spelling) => typeof spelling === "string") ||
			!isAliasTarget(alias.target) ||
			(alias.locale !== undefined &&
				!(
					typeof alias.locale === "string" ||
					(Array.isArray(alias.locale) &&
						alias.locale.every((locale) => typeof locale === "string"))
				)) ||
			(alias.caseSensitive !== undefined &&
				typeof alias.caseSensitive !== "boolean") ||
			(alias.boundary !== undefined &&
				alias.boundary !== "none" &&
				alias.boundary !== "word") ||
			(alias.lexiconId !== undefined && typeof alias.lexiconId !== "string")
		)
			throw new TypeError(`Invalid value authoring profile: aliases[${index}]`);
	}
	for (const [index, group] of value.fundamentals.entries()) {
		if (
			!isRecord(group) ||
			typeof group.id !== "string" ||
			!Array.isArray(group.variants) ||
			!group.variants.every(isFundamentalVariant)
		)
			throw new TypeError(
				`Invalid value authoring profile: fundamentals[${index}]`,
			);
	}
	for (const [index, recipe] of value.recipes.entries()) {
		if (
			!isRecord(recipe) ||
			typeof recipe.id !== "string" ||
			!isRecipeNode(recipe.root) ||
			(recipe.priority !== undefined && typeof recipe.priority !== "number") ||
			(recipe.outputBuilderId !== undefined &&
				typeof recipe.outputBuilderId !== "string")
		)
			throw new TypeError(`Invalid value authoring profile: recipes[${index}]`);
	}
	for (const [argumentId, policy] of Object.entries(value.argumentPolicies)) {
		if (!isArgumentPolicy(policy))
			throw new TypeError(
				`Invalid value authoring profile: argumentPolicies.${argumentId}`,
			);
	}
	return value as unknown as ValueAuthoringProfile;
}

export function roundTripValueAuthoringProfile(
	profile: ValueAuthoringProfile,
): ValueAuthoringProfile {
	return deserializeValueAuthoringProfile(
		JSON.parse(JSON.stringify(serializeValueAuthoringProfile(profile))),
	);
}

export function compileValueAuthoringProfile(
	profile: ValueAuthoringProfile,
): ValueAuthoringValidation {
	const result = compileAuthoredValueGraph(profile);
	const diagnostics = [
		...result.diagnostics.map(toSettingsDiagnostic),
		...compileValueAuthoringPolicies(profile, result.grammar).diagnostics,
	];
	return {
		valid:
			result.valid &&
			diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
		diagnostics,
		graphFingerprint: authoredValueGraphFingerprint(profile),
	};
}

/** Resolve consumer policies against the same compiled graph used by the wizard. */
export function compileValueAuthoringPolicies(
	profile: ValueAuthoringProfile,
	grammar = compileAuthoredValueGraph(toAuthoredValueGraph(profile)).grammar,
): CompiledValueAuthoringPolicies {
	const diagnostics: SettingsDiagnostic[] = [];
	const recipeIds = new Set(
		grammar.recipes?.recipes.map((recipe) => recipe.id) ?? [],
	);
	const policies: Record<string, CompiledArgumentPolicy> = {};
	for (const [argumentId, policy] of Object.entries(
		profile.argumentPolicies ?? {},
	)) {
		for (const recipeId of policy.enabledRecipes ?? []) {
			if (!recipeIds.has(recipeId))
				diagnostics.push({
					severity: "error",
					code: "UNKNOWN_ENABLED_RECIPE",
					path: ["argumentPolicies", argumentId, "enabledRecipes"],
					messageKey: "values.recipe.unknownRecipe",
					messageParams: { recipeId },
				});
		}
		if (
			typeof policy.bounds === "string" &&
			grammar.bounds[policy.bounds] === undefined
		)
			diagnostics.push({
				severity: "error",
				code: "UNKNOWN_BOUNDS_REFERENCE",
				path: ["argumentPolicies", argumentId, "bounds"],
				messageKey: "settings.diagnostic.invalidValue",
				messageParams: { path: `argumentPolicies.${argumentId}.bounds` },
			});
		policies[argumentId] = resolveArgumentPolicy(
			"settings",
			"values",
			argumentId,
			grammar,
			policy,
		);
	}
	return { policies, diagnostics };
}

export function createValueAuthoringDraft(
	profile: ValueAuthoringProfile,
	options: {
		readonly revision?: string;
		readonly dirty?: boolean;
		readonly activeDomain?: string;
		readonly selectedGroupId?: string;
		readonly selectedRecipeId?: string;
	} = {},
): ValueAuthoringDraft {
	const validation = compileValueAuthoringProfile(profile);
	const hasAuthoredGraph =
		(profile.aliases?.length ?? 0) > 0 ||
		(profile.fundamentals?.length ?? 0) > 0 ||
		(profile.recipes?.length ?? 0) > 0 ||
		Object.keys(profile.values?.dateTime?.formats ?? {}).length > 0;
	return {
		profile,
		activeDomain: options.activeDomain,
		selectedGroupId: options.selectedGroupId,
		selectedRecipeId: options.selectedRecipeId,
		revision: options.revision ?? "",
		dirty: options.dirty ?? false,
		diagnostics: validation.diagnostics,
		graphFingerprint: validation.graphFingerprint,
		compileStatus: !hasAuthoredGraph
			? "empty"
			: validation.valid
				? "valid"
				: "invalid",
	};
}

function toSettingsDiagnostic(diagnostic: {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, string | number | boolean>>;
	readonly code?: string;
	readonly errorCode?: string;
	readonly recipeId?: string;
	readonly groupId?: string;
	readonly variantId?: string;
	readonly path?: readonly string[];
}): SettingsDiagnostic {
	return {
		severity: "error",
		code: diagnostic.code ?? diagnostic.errorCode,
		path:
			diagnostic.path ??
			(diagnostic.recipeId
				? ["recipes", diagnostic.recipeId]
				: diagnostic.groupId
					? [
							"fundamentals",
							diagnostic.groupId,
							...(diagnostic.variantId ? [diagnostic.variantId] : []),
						]
					: undefined),
		messageKey: diagnostic.messageKey,
		messageParams: diagnostic.messageParams,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype ||
			Object.getPrototypeOf(value) === null)
	);
}

function isSettingsScope(value: unknown): value is SettingsScope {
	return value === "user" || value === "workspace" || value === "folder";
}

const ALIAS_NAMESPACES: readonly AliasNamespace[] = [
	"canonical-id",
	"literal",
	"resolver",
	"fundamental",
	"extraction",
	"number-word",
];

function isAliasNamespace(value: unknown): value is AliasNamespace {
	return (
		typeof value === "string" &&
		ALIAS_NAMESPACES.includes(value as AliasNamespace)
	);
}

function isAliasTarget(value: unknown): value is AliasTarget {
	if (!isRecord(value) || typeof value.kind !== "string") return false;
	switch (value.kind) {
		case "canonical":
		case "literal":
			return typeof value.value === "string";
		case "extraction":
			return typeof value.extractionId === "string";
		case "number-word":
			return typeof value.value === "number" && Number.isFinite(value.value);
		case "fundamental":
			return (
				typeof value.groupId === "string" &&
				(value.variantId === undefined || typeof value.variantId === "string")
			);
		case "resolver":
			return (
				typeof value.resolverId === "string" &&
				(value.params === undefined ||
					(isRecord(value.params) &&
						Object.values(value.params).every(
							(param) => typeof param === "string",
						)))
			);
		default:
			return false;
	}
}

function isFundamentalVariant(value: unknown): boolean {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		!Array.isArray(value.slots)
	)
		return false;
	return value.slots.every(
		(slot) =>
			isRecord(slot) &&
			typeof slot.id === "string" &&
			(slot.parserId === undefined || typeof slot.parserId === "string") &&
			(slot.pattern === undefined || typeof slot.pattern === "string"),
	);
}

function isRecipeNode(value: unknown): boolean {
	if (!isRecord(value) || typeof value.kind !== "string") return false;
	if (value.kind === "terminal") return typeof value.consumerId === "string";
	if (value.kind === "recipe") return typeof value.recipeId === "string";
	return (
		value.kind === "fundamental" &&
		typeof value.groupId === "string" &&
		Array.isArray(value.children) &&
		value.children.every(isRecipeNode) &&
		(value.variantIds === undefined ||
			(Array.isArray(value.variantIds) &&
				value.variantIds.every((id) => typeof id === "string")))
	);
}

function isArgumentPolicy(value: unknown): boolean {
	if (!isRecord(value)) return false;
	for (const items of [
		value.allowedUnits,
		value.allowedCurrencies,
		value.enabledRecipes,
	]) {
		if (
			items !== undefined &&
			(!Array.isArray(items) ||
				!items.every((item) => typeof item === "string"))
		)
			return false;
	}
	if (
		["allowRange", "allowOperator", "allowDataPointCount"].some(
			(key) => value[key] !== undefined && typeof value[key] !== "boolean",
		)
	)
		return false;
	if (value.path !== undefined && typeof value.path !== "string") return false;
	if (
		value.priorityOverrides !== undefined &&
		(!isRecord(value.priorityOverrides) ||
			!Object.values(value.priorityOverrides).every(
				(priority) => typeof priority === "number" && Number.isFinite(priority),
			))
	)
		return false;
	if (
		value.bounds !== undefined &&
		typeof value.bounds !== "string" &&
		(!isRecord(value.bounds) ||
			!["min", "max"].every(
				(key) =>
					(value.bounds as Record<string, unknown>)[key] === undefined ||
					(typeof (value.bounds as Record<string, unknown>)[key] === "number" &&
						Number.isFinite(
							(value.bounds as Record<string, unknown>)[key] as number,
						)),
			))
	)
		return false;
	return true;
}

function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		(typeof value === "number" && Number.isFinite(value)) ||
		typeof value === "boolean"
	)
		return true;
	if (Array.isArray(value)) return value.every(isJsonValue);
	return isRecord(value) && Object.values(value).every(isJsonValue);
}

function stripRuntimeResolvers<T>(value: T): T {
	if (Array.isArray(value)) return value.map(stripRuntimeResolvers) as T;
	if (!isRecord(value)) return value;
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (key === "aliasResolvers") continue;
		if (typeof child === "function")
			throw new TypeError("Value authoring profile contains non-JSON data");
		result[key] = stripRuntimeResolvers(child);
	}
	return result as T;
}

function stableSerialize(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
		.join(",")}}`;
}

function fnv1a(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
