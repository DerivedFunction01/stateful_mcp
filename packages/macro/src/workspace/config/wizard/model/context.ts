import type {
	SettingsDiagnosticDto,
	SettingsScope,
	ValueAuthoringProfileDto,
	ValueCatalogDto,
	ValueRequestDto,
	ValueSampleResultDto,
} from "@stateful-mcp/macro-protocol";
import type {
	NumberWordScaleDraft,
	NumericOptionKey,
	StableIdEntryView,
	WizardCollectionKey,
	WizardEntryValue,
} from "../collections";
import type { WizardAuthoringPort } from "../port";
import type {
	Debouncer,
	ScheduleFn,
	VersionedRequestTracker,
} from "../scheduler";
import type {
	SandboxSampleRow,
	ValueAuthoringWizardState,
	WizardErrorState,
	WizardFailedOp,
	WizardGuardDenial,
	WizardProfileSummary,
	WizardScopeAvailability,
	WizardStepId,
	WizardValidationState,
} from "../state";
import type { NumericLexiconView } from "../steps/numerics";
import type {
	NewLocalProfileInput,
	projectScopeProfileStep,
} from "../steps/scope-profile";

export const TRANSPORT_ERROR_CODE = "TRANSPORT_ERROR";
export const TRANSPORT_ERROR_MESSAGE_KEY = "errors.transportFailed";

export interface WizardModelOptions {
	/** Debounce window for validation/preview scheduling (default 250ms). */
	readonly debounceMs?: number;
	/** Injected scheduler; defaults to real timers for production use. */
	readonly schedule?: ScheduleFn;
	readonly activeProfileId?: string | null;
	readonly availableProfiles?: readonly WizardProfileSummary[];
	/** Scopes reported supported; others surface unavailability. */
	readonly supportedScopes?: readonly SettingsScope[];
	/**
	 * Resolves parent profiles along `extends` chains for inheritance folding.
	 * Omit for flat stores; provenance then marks every entry local-only.
	 */
	readonly resolveParentProfile?: (
		parentId: string,
	) => ValueAuthoringProfileDto | null;
}

/** Union of transport outcomes the save lifecycle distinguishes. */
type SaveStateMutable =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "saved"; revision: string }
	| { kind: "blocked"; diagnostics: readonly SettingsDiagnosticDto[] };

export interface WizardModelInternals {
	ready: boolean;
	step: WizardStepId;
	guardDenials: WizardGuardDenial[];
	editedProfileId: string | null;
	activeProfileId: string | null;
	editedLabel: string | null;
	editedExtendsId: string | null;
	parentMissing: boolean;
	scope: SettingsScope | null;
	scopeAvailability: WizardScopeAvailability[];
	availableProfiles: readonly WizardProfileSummary[];
	baselineRevision: string | null;
	dirty: boolean;
	catalog: ValueCatalogDto | null;
	validation: WizardValidationState;
	fieldDiagnostics: Readonly<Record<string, readonly SettingsDiagnosticDto[]>>;
	preview: {
		status: "idle" | "queued" | "running" | "settled" | "rejected";
		rejectedCode: string | null;
		reasonKey: string | null;
		samples: SandboxSampleRow[];
		request: ValueRequestDto | null;
		results: readonly ValueSampleResultDto[];
		staleCount: number;
		selectedRecipeId: string | null;
		showRejected: boolean;
	};
	provenance: Readonly<Record<string, string>>;
	inheritedEntryIdsLists: Record<WizardCollectionKey, string[]>;
	saveState: SaveStateMutable;
	conflict: ValueAuthoringWizardState["conflict"];
	lastError: WizardErrorState | null;
	activationAvailable: boolean;
	activationPending: boolean;
}

/**
 * Shared, closure-free bundle of every piece of mutable wizard state plus the
 * injected primitives the lifecycle helpers need. Splitting the model into
 * focused modules (`context`/`snapshot`/`transport`/`store`) would otherwise
 * require dozens of cross-module closure references; threading this single
 * context keeps the original behavior identical while removing the closure.
 */
export interface ModelRuntimeContext {
	readonly options: WizardModelOptions;
	readonly port: WizardAuthoringPort;
	readonly debouncer: Debouncer;
	readonly validateTokens: VersionedRequestTracker;
	readonly previewTokens: VersionedRequestTracker;
	readonly s: WizardModelInternals;
	readonly listeners: Set<(next: ValueAuthoringWizardState) => void>;
	readonly pendingRequests: Set<"validate" | "preview" | "save">;
	currentLocal: ValueAuthoringProfileDto | null;
	loadedLocal: ValueAuthoringProfileDto | null;
	parentMerged: ValueAuthoringProfileDto | null;
	inheritedIds: Record<WizardCollectionKey, ReadonlySet<string>>;
	runtimeDiagnostics: SettingsDiagnosticDto[];
	latest: ValueAuthoringWizardState;
}

export type { ValueAuthoringWizardState, WizardFailedOp, WizardStepId };

export function emptyInheritedSets(): Record<
	WizardCollectionKey,
	ReadonlySet<string>
> {
	return {
		aliases: new Set(),
		fundamentals: new Set(),
		recipes: new Set(),
		dateTimeFormats: new Set(),
	};
}

export interface ValueAuthoringWizardStore {
	getState(): ValueAuthoringWizardState;
	subscribe(listener: (next: ValueAuthoringWizardState) => void): () => void;
	dispose(): void;
	view: {
		scopeStep(): ReturnType<typeof projectScopeProfileStep>;
		numerics(): NumericLexiconView;
		stableIdEntries(): readonly StableIdEntryView[];
	};
	actions: {
		startEdit(profileId: string): Promise<boolean>;
		startNewLocal(input: NewLocalProfileInput): boolean;
		goToStep(step: WizardStepId): boolean;
		chooseScope(scope: SettingsScope): boolean;
		setNumericOption(
			key: NumericOptionKey,
			value: string | boolean | null,
		): boolean;
		toggleNumericForm(
			form: Parameters<typeof import("../steps/numerics").editNumericForm>[1],
			on: boolean,
		): boolean;
		setNumberWordAtom(word: string, digits: string | null): boolean;
		setNumberWordScales(scales: readonly NumberWordScaleDraft[]): boolean;
		addToCollection(
			kind: WizardCollectionKey,
			entry: WizardEntryValue,
		): boolean;
		replaceInCollection(
			kind: WizardCollectionKey,
			entry: WizardEntryValue,
		): boolean;
		removeFromCollection(kind: WizardCollectionKey, id: string): boolean;
		resetToInherited(kind: WizardCollectionKey, id: string): boolean;
		setCollectionEntryEnabled(
			kind: WizardCollectionKey,
			id: string,
			enabled: boolean,
		): boolean;
		updateCollectionEntry(
			kind: WizardCollectionKey,
			id: string,
			patch: Record<string, unknown>,
		): boolean;
		addDateTimeFormat(input: {
			id: string;
			kind: "date" | "time" | "datetime";
			source?: string;
			parserPriority?: number;
		}): boolean;
		editDateTimeFormatSource(id: string, source: string): boolean;
		setDateTimeFormatPriority(id: string, priority: number | null): boolean;
		setDateTimeFormatEnabled(id: string, enabled: boolean): boolean;
		removeDateTimeFormat(id: string): boolean;
		setRecipePriority(recipeId: string, priority: number | null): boolean;
		setSandboxSamples(samples: readonly SandboxSampleRow[]): boolean;
		setSandboxRequest(request: ValueRequestDto | null): boolean;
		selectSampleRecipe(recipeId: string | null): boolean;
		showSandboxRejected(show: boolean): boolean;
		runSandbox(): Promise<boolean>;
		save(): Promise<boolean>;
		acknowledgeConflict(): Promise<boolean>;
		refreshBaseline(): Promise<boolean>;
		retryLast(): Promise<boolean>;
		clearLastError(): boolean;
		activate(expectedProjectRevision?: string): Promise<boolean>;
	};
}
