import type {
	JsonValue,
	ValueAliasDefinitionDto,
	ValueAuthoringProfileDto,
	ValueFundamentalGroupDto,
	ValueRecipeDto,
} from "@stateful-mcp/macro-protocol";
import { NUMERIC_FORMS, type NumericForm } from "../../../values/numeric";
import { resolveEffectiveProfile } from "../value-authoring";
import type {
	EntryProvenance,
	ProvenanceMap,
	WizardCollectionKey,
} from "./state";
import { WIZARD_COLLECTION_KEYS } from "./state";

export type { EntryProvenance, ProvenanceMap, WizardCollectionKey };

/** JSON-safe date-time format record as persisted under `values.dateTime.formats`. */
export interface WizardDateTimeFormatDto {
	readonly id: string;
	readonly kind: "date" | "time" | "datetime";
	readonly source?: string;
	readonly parserEnabled?: boolean;
	readonly parserPriority?: number;
	readonly displayLabel?: string;
	readonly options?: Record<string, JsonValue>;
}

export type WizardEntryValue =
	| ValueAliasDefinitionDto
	| ValueFundamentalGroupDto
	| ValueRecipeDto
	| WizardDateTimeFormatDto;

export const REMOVED_ID_KEYS: Readonly<Record<WizardCollectionKey, string>> =
	Object.freeze({
		aliases: "aliases",
		fundamentals: "fundamentals",
		recipes: "recipes",
		dateTimeFormats: "dateTimeFormats",
	});

const ENABLED_FIELDS: Partial<
	Record<WizardCollectionKey, "enabled" | "parserEnabled">
> = Object.freeze({
	recipes: "enabled",
	dateTimeFormats: "parserEnabled",
});

export function enabledFieldFor(kind: WizardCollectionKey) {
	return ENABLED_FIELDS[kind];
}

export function cloneProfile(
	profile: ValueAuthoringProfileDto,
): ValueAuthoringProfileDto {
	return structuredClone(profile);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getCollectionEntries(
	profile: ValueAuthoringProfileDto | null,
	kind: WizardCollectionKey,
): WizardEntryValue[] {
	if (!profile) return [];
	if (kind === "dateTimeFormats") {
		const formats = (profile.values?.dateTime as Record<string, unknown>)
			?.formats as Record<string, WizardDateTimeFormatDto> | undefined;
		return formats ? Object.values(formats) : [];
	}
	const entries = profile[kind] as readonly WizardEntryValue[] | undefined;
	return entries ? [...entries] : [];
}

export function getEntryById(
	profile: ValueAuthoringProfileDto | null,
	kind: WizardCollectionKey,
	id: string,
): WizardEntryValue | null {
	const found = getCollectionEntries(profile, kind).find(
		(entry) => entry.id === id,
	);
	return found ?? null;
}

export function getTombstones(
	profile: ValueAuthoringProfileDto | null,
	kind: WizardCollectionKey,
): readonly string[] {
	const key = REMOVED_ID_KEYS[kind];
	return profile?.removedIds?.[key] ?? [];
}

/**
 * Mirrors macro's authored-graph emptiness rule so graph status mapping
 * (`empty` vs `valid`/`invalid`) never diverges from the persisted contract.
 */
export function isAuthoredGraphEmpty(
	profile: ValueAuthoringProfileDto | null,
): boolean {
	if (!profile) return true;
	return (
		(profile.aliases?.length ?? 0) === 0 &&
		(profile.fundamentals?.length ?? 0) === 0 &&
		(profile.recipes?.length ?? 0) === 0 &&
		getCollectionEntries(profile, "dateTimeFormats").length === 0
	);
}

// ---------------------------------------------------------------------------
// Immutable edit operations over the local layer
// ---------------------------------------------------------------------------

function withCollections(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	next: readonly WizardEntryValue[],
): ValueAuthoringProfileDto {
	if (kind === "dateTimeFormats") {
		const formats: Record<string, WizardDateTimeFormatDto> = {};
		for (const entry of next)
			formats[entry.id] = entry as WizardDateTimeFormatDto;
		const dateTime = {
			...(isRecord(profile.values?.dateTime) ? profile.values.dateTime : {}),
			formats,
		};
		return {
			...profile,
			values: { ...(profile.values ?? {}), dateTime },
		} as unknown as ValueAuthoringProfileDto;
	}
	const collection =
		next.length > 0 || profile[kind] !== undefined ? [...next] : undefined;
	if (collection === undefined) return profile;
	return { ...profile, [kind]: collection } as ValueAuthoringProfileDto;
}

/** Appends a brand-new entry; errors when the stable ID already exists. */
export function appendEntry(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	entry: WizardEntryValue & { id: string },
): ValueAuthoringProfileDto {
	if (getEntryById(profile, kind, entry.id)) {
		throw new Error(`Duplicate stable id ${entry.id} in ${kind}`);
	}
	return withCollections(profile, kind, [
		...getCollectionEntries(profile, kind),
		structuredClone(entry),
	]);
}

/**
 * Replaces an entry by stable ID in place. Missing IDs fall back to append;
 * existing positions are preserved so ordering stays deterministic.
 */
export function replaceEntry(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	entry: WizardEntryValue & { id: string },
): ValueAuthoringProfileDto {
	const entries = getCollectionEntries(profile, kind);
	const index = entries.findIndex((candidate) => candidate.id === entry.id);
	if (index === -1) return appendEntry(profile, kind, entry);
	const next = [...entries];
	next[index] = structuredClone(entry);
	return withCollections(profile, kind, next);
}

/** Merges a shallow patch into one entry; `undefined` patch keys are dropped. */
export function updateEntry(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
	patch: Record<string, unknown>,
): ValueAuthoringProfileDto {
	const current = getEntryById(profile, kind, id);
	if (!current) throw new Error(`Unknown stable id ${id} in ${kind}`);
	const merged: Record<string, unknown> = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete merged[key];
		else merged[key] = value;
	}
	return replaceEntry(
		profile,
		kind,
		merged as unknown as WizardEntryValue & { id: string },
	);
}

function writeTombstone(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
	tombstoned: boolean,
): ValueAuthoringProfileDto {
	const key = REMOVED_ID_KEYS[kind];
	const removedIds = { ...(profile.removedIds ?? {}) };
	const current = new Set(removedIds[key] ?? []);
	if (tombstoned) current.add(id);
	else current.delete(id);
	if (current.size === 0) delete removedIds[key];
	else removedIds[key] = [...current].sort();
	return { ...profile, removedIds };
}

function dropLocalCopy(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
): ValueAuthoringProfileDto {
	const entries = getCollectionEntries(profile, kind);
	const filtered = entries.filter((entry) => entry.id !== id);
	return withCollections(profile, kind, filtered);
}

/**
 * Removes a stable-ID entry from the editable set. Inherited data is never
 * deleted locally; a tombstone in `removedIds` suppresses it instead.
 */
export function removeEntry(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
): ValueAuthoringProfileDto {
	let next = dropLocalCopy(profile, kind, id);
	next = writeTombstone(next, kind, id, true);
	return next;
}

/** Clears a tombstone and drops any local override for the entry. */
export function resetToInherited(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
): ValueAuthoringProfileDto {
	let next = dropLocalCopy(profile, kind, id);
	next = writeTombstone(next, kind, id, false);
	return next;
}

/** Toggles an entry's enabled flag (`enabled` / `parserEnabled`). */
export function setEntryEnabled(
	profile: ValueAuthoringProfileDto,
	kind: WizardCollectionKey,
	id: string,
	enabled: boolean,
): ValueAuthoringProfileDto {
	const field = ENABLED_FIELDS[kind];
	if (!field) throw new Error(`Collection ${kind} has no enabled flag`);
	return updateEntry(profile, kind, id, { [field]: enabled });
}

/** Priority edit helper shared by templates and combinators slices. */
export function setEntryPriority(
	profile: ValueAuthoringProfileDto,
	kind: Extract<WizardCollectionKey, "recipes" | "dateTimeFormats">,
	id: string,
	priority: number | null,
): ValueAuthoringProfileDto {
	const field = kind === "recipes" ? "priority" : "parserPriority";
	return updateEntry(profile, kind, id, { [field]: priority ?? undefined });
}

// ---------------------------------------------------------------------------
// Canonical numeric / lexicon value patches
// ---------------------------------------------------------------------------

export type NumericOptionKey =
	| "decimalSeparator"
	| "thousandsSeparator"
	| "allowNegative"
	| "allowFractions"
	| "allowMixedFractions"
	| "allowScientific";

/** Numeric option patch preserving protocol field names exactly. */
export function setNumericOption(
	profile: ValueAuthoringProfileDto,
	key: NumericOptionKey,
	value: string | boolean | null,
): ValueAuthoringProfileDto {
	return patchValuesDomain(profile, "numeric", { [key]: value ?? undefined });
}

/** Maintains `allowedForms` in canonical NUMERIC_FORMS order. */
export function toggleNumericForm(
	profile: ValueAuthoringProfileDto,
	form: NumericForm,
	on: boolean,
): ValueAuthoringProfileDto {
	const current = ((profile.values?.numeric as Record<string, unknown>) ?? {})
		.allowedForms as readonly string[] | undefined;
	const set = new Set(current ?? []);
	if (on) set.add(form);
	else set.delete(form);
	const allowedForms = NUMERIC_FORMS.filter((form) => set.has(form));
	return patchValuesDomain(profile, "numeric", { allowedForms });
}

export interface NumberWordScaleDraft {
	readonly word: string;
	readonly value: number;
	readonly type: "minor" | "major";
}

export function setNumberWordAtom(
	profile: ValueAuthoringProfileDto,
	word: string,
	digits: string | null,
): ValueAuthoringProfileDto {
	const atoms = {
		...((profile.numberWords?.atoms as Record<string, string>) ?? {}),
	};
	if (digits === null) delete atoms[word];
	else atoms[word] = digits;
	const numberWords = { ...(profile.numberWords ?? {}), atoms };
	return { ...profile, numberWords };
}

export function setNumberWordScales(
	profile: ValueAuthoringProfileDto,
	scales: readonly NumberWordScaleDraft[],
): ValueAuthoringProfileDto {
	const scalesRecord =
		scales.length > 0 ? structuredClone([...scales]) : undefined;
	const numberWords = { ...(profile.numberWords ?? {}) };
	if (scalesRecord === undefined) delete numberWords.scales;
	else numberWords.scales = scalesRecord as never;
	return { ...profile, numberWords } as ValueAuthoringProfileDto;
}

/** Deep-merges a patch under `values.<domain>`; undefined removes keys. */
export function patchValuesDomain(
	profile: ValueAuthoringProfileDto,
	domain: string,
	patch: Record<string, unknown>,
): ValueAuthoringProfileDto {
	const domainValue = {
		...(isRecord(profile.values?.[domain]) ? profile.values[domain] : {}),
		...cleanPatch(patch),
	};
	const values = { ...(profile.values ?? {}), [domain]: domainValue };
	return { ...profile, values } as ValueAuthoringProfileDto;
}

function cleanPatch(patch: Record<string, unknown>): Record<string, unknown> {
	const clean: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined || value === null) continue;
		clean[key] = value;
	}
	return clean;
}

// ---------------------------------------------------------------------------
// Effective snapshot and provenance
// ---------------------------------------------------------------------------

type RuntimeProfile = Parameters<typeof resolveEffectiveProfile>[0];

/**
 * Folds a parent chain into a single parent-side layer. The wizard works on
 * protocol DTOs while reusing macro's canonical inheritance semantics via the
 * runtime resolver; both shapes are plain persisted JSON.
 */
export function computeEffectiveSnapshot(
	localLayer: ValueAuthoringProfileDto,
	parentMerged: ValueAuthoringProfileDto | null,
): ValueAuthoringProfileDto {
	if (!parentMerged) return cloneProfile(localLayer);
	return structuredClone(
		resolveEffectiveProfile(
			localLayer as unknown as RuntimeProfile,
			parentMerged as unknown as RuntimeProfile,
		) as unknown as ValueAuthoringProfileDto,
	);
}

export function foldParentChain(
	resolver: (parentId: string) => ValueAuthoringProfileDto | null,
	startExtendsId: string | undefined,
): {
	parentMerged: ValueAuthoringProfileDto | null;
	missingAncestorId: string | null;
} {
	if (!startExtendsId) return { parentMerged: null, missingAncestorId: null };
	const seen = new Set<string>();
	let cursorId: string | undefined = startExtendsId;
	let acc: ValueAuthoringProfileDto | null = null;
	while (cursorId && !seen.has(cursorId)) {
		seen.add(cursorId);
		const parent = resolver(cursorId);
		if (!parent)
			return {
				parentMerged: acc,
				missingAncestorId: cursorId,
			};
		acc = acc ? computeEffectiveSnapshot(parent, acc) : cloneProfile(parent);
		cursorId = typeof parent.extends === "string" ? parent.extends : undefined;
	}
	return { parentMerged: acc, missingAncestorId: null };
}

export function entryIdsByKind(
	profile: ValueAuthoringProfileDto | null,
): Record<WizardCollectionKey, Set<string>> {
	const result = {} as Record<WizardCollectionKey, Set<string>>;
	for (const kind of WIZARD_COLLECTION_KEYS) {
		result[kind] = new Set(
			getCollectionEntries(profile, kind).map((entry) => entry.id),
		);
	}
	return result;
}

export interface ProvenanceInputs {
	/** Working local layer. */
	readonly currentLocal: ValueAuthoringProfileDto;
	/** Local layer frozen at load time. */
	readonly loadedLocal: ValueAuthoringProfileDto;
	/** Entry IDs that come purely from resolved parents. */
	readonly inheritedIds: Readonly<
		Record<WizardCollectionKey, ReadonlySet<string>>
	>;
}

/**
 * Derives provenance per visible stable-ID entry:
 * precedence disabled > replaced > appended > local > inherited.
 * Tombstoned IDs are not part of the map at all.
 */
export function deriveProvenance(inputs: ProvenanceInputs): ProvenanceMap {
	const map: Record<string, EntryProvenance> = {};
	const currentIds = entryIdsByKind(inputs.currentLocal);
	const loadedIds = entryIdsByKind(inputs.loadedLocal);
	for (const kind of WIZARD_COLLECTION_KEYS) {
		const tombstones = new Set(getTombstones(inputs.currentLocal, kind));
		const enabledField = ENABLED_FIELDS[kind];
		for (const id of currentIds[kind]) {
			if (tombstones.has(id)) continue;
			const entry = getEntryById(inputs.currentLocal, kind, id);
			const hadLocalAtLoad = loadedIds[kind].has(id);
			const isInherited = inputs.inheritedIds[kind].has(id);
			let provenance: EntryProvenance;
			const enabledFlag =
				enabledField && entry
					? (entry as unknown as Record<string, unknown>)[enabledField]
					: undefined;
			if (enabledFlag === false) {
				provenance = "disabled";
			} else if (isInherited) {
				provenance = "replaced";
			} else if (!hadLocalAtLoad) {
				provenance = "appended";
			} else {
				provenance = "local";
			}
			map[`${kind}:${id}`] = provenance;
		}
		for (const id of inputs.inheritedIds[kind]) {
			if (tombstones.has(id)) continue;
			if (currentIds[kind].has(id)) continue;
			map[`${kind}:${id}`] = "inherited";
		}
	}
	return map;
}

export interface StableIdEntriesInput extends ProvenanceInputs {
	/**
	 * Pure parent-chain merge (no local overrides). Used to materialize
	 * inherited entry content; the local-resolved effective snapshot would
	 * shadow replaced entries with their overrides.
	 */
	readonly parentMerged: ValueAuthoringProfileDto | null;
}

export interface StableIdEntryView {
	readonly kind: WizardCollectionKey;
	readonly id: string;
	readonly provenance: EntryProvenance;
	/** Content the renderer should show (local override when present). */
	readonly definition: WizardEntryValue;
	/** Parent-side content when this ID also exists inherited; else null. */
	readonly inheritedDefinition: WizardEntryValue | null;
}

/**
 * Projects the editable stable-ID collections with provenance and content,
 * merging inherited entries (from the effective snapshot) with local ones.
 * Tombstoned entries are excluded entirely.
 */
export function listStableIdEntries(
	inputs: StableIdEntriesInput,
): readonly StableIdEntryView[] {
	const provenance = deriveProvenance(inputs);
	const views: StableIdEntryView[] = [];
	for (const kind of WIZARD_COLLECTION_KEYS) {
		const tombstones = new Set(getTombstones(inputs.currentLocal, kind));
		const seen = new Set<string>();
		for (const entry of getCollectionEntries(inputs.currentLocal, kind)) {
			if (tombstones.has(entry.id) || seen.has(entry.id)) continue;
			seen.add(entry.id);
			views.push({
				kind,
				id: entry.id,
				provenance: provenance[`${kind}:${entry.id}`] ?? "local",
				definition: structuredClone(entry),
				inheritedDefinition: inputs.inheritedIds[kind].has(entry.id)
					? getEntryById(inputs.parentMerged, kind, entry.id)
					: null,
			});
		}
		for (const id of inputs.inheritedIds[kind]) {
			if (tombstones.has(id) || seen.has(id)) continue;
			const definition = getEntryById(inputs.parentMerged, kind, id);
			if (!definition) continue;
			seen.add(id);
			views.push({
				kind,
				id,
				provenance: "inherited",
				definition: structuredClone(definition),
				inheritedDefinition: structuredClone(definition),
			});
		}
	}
	return views;
}

// ---------------------------------------------------------------------------
// Deterministic content identity
// ---------------------------------------------------------------------------
