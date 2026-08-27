import type {
	MessageParam,
	SettingsDiagnosticDto,
	SettingsScope,
	ValueAuthoringProfileDto,
	ValueCatalogDto,
	ValueRequestDto,
	ValueSampleResultDto,
} from "@stateful-mcp/macro-protocol";

/** Ordered wizard steps; navigation guards are evaluated against this order. */
export const WIZARD_STEPS = [
	"scope-profile",
	"numerics-lexicon",
	"base-templates",
	"combinators",
	"sandbox",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

/** Stable-ID collection kinds the wizard can edit. */
export const WIZARD_COLLECTION_KEYS = [
	"aliases",
	"fundamentals",
	"recipes",
	"dateTimeFormats",
] as const;

export type WizardCollectionKey = (typeof WIZARD_COLLECTION_KEYS)[number];

/**
 * Per-entry provenance derived by comparing local-layer IDs against the
 * baseline/effective profile snapshot taken at load:
 * - `inherited`: comes from a parent profile; no local override exists.
 * - `local`: pre-existing local definition without a parent counterpart.
 * - `replaced`: a stable ID that also exists in a parent; the local layer
 *   supplies the overriding definition.
 * - `appended`: new local entry introduced during this editing session.
 * - `disabled`: present in the local layer with its enabled flag off.
 */
export type EntryProvenance =
	| "local"
	| "inherited"
	| "replaced"
	| "appended"
	| "disabled";

/** Provenance map keys are `<collectionKey>:<entryId>`. */
export type ProvenanceMap = Readonly<Record<string, EntryProvenance>>;

export interface WizardGuardDenial {
	readonly from: WizardStepId | null;
	readonly to: WizardStepId;
	readonly code: string;
	readonly reasonKey: string;
}

export type WizardGraphStatus = "unknown" | "empty" | "valid" | "invalid";

export interface WizardValidationState {
	readonly status: "idle" | "pending" | "settled";
	/** True when the latest settled validation considers the graph valid. */
	readonly valid: boolean | null;
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly graphFingerprint: string | null;
	readonly graphStatus: WizardGraphStatus;
	/** True when errors indicate malformed mandatory authored-graph syntax. */
	readonly malformedSyntaxFailure: boolean;
}

export interface SandboxSampleRow {
	readonly input: string;
	readonly argumentId?: string;
}

export interface SandboxRequestConfig {
	readonly valueKind: string;
	readonly requiredFields?: readonly string[];
	readonly allowAdditionalFields?: boolean;
}

export interface WizardPreviewState {
	readonly status: "idle" | "queued" | "running" | "settled" | "rejected";
	/** Structured rejection code when previews are refused before transport. */
	readonly rejectedCode: string | null;
	readonly reasonKey: string | null;
	readonly samples: readonly SandboxSampleRow[];
	/** Semantic request builder payload sent with sandbox preview runs. */
	readonly request: ValueRequestDto | null;
	readonly results: readonly ValueSampleResultDto[];
	/** Count of late responses discarded because a newer request superseded them. */
	readonly staleCount: number;
	/** Selected candidate recipe for presentation; null when unset. */
	readonly selectedRecipeId: string | null;
	/** Whether rejected candidates are surfaced alongside selected ones. */
	readonly showRejected: boolean;
	/** Previews never persist; carried explicitly so renderers stay honest. */
	readonly previewPersisted: false;
}

export type WizardSaveState =
	| { readonly kind: "idle" }
	| { readonly kind: "saving" }
	| { readonly kind: "saved"; readonly revision: string }
	| {
			readonly kind: "blocked";
			readonly diagnostics: readonly SettingsDiagnosticDto[];
	  };

export interface WizardConflictState {
	readonly code: "SETTINGS_REVISION_STALE";
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly expectedRevision?: string;
	readonly actualRevision?: string;
	/** Navigation out of this step stays frozen until the conflict is resolved. */
	readonly originStep: WizardStepId;
}

/** Structured transport-level error state; never rendered from model copy. */
export interface WizardErrorState {
	readonly code: string;
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly retryable: true;
	readonly op: WizardFailedOp;
	/** Inputs captured for `retryLast()` (e.g. the profile id being loaded). */
	readonly retryPayload?: Readonly<{ profileId?: string }>;
}

export type WizardFailedOp =
	| "load"
	| "validate"
	| "preview"
	| "save"
	| "refreshBaseline"
	| "activate";

export interface WizardActivationState {
	/** Whether the injected port supports an activate extension point at all. */
	readonly available: boolean;
	/** Edited profile differs from the active runtime profile and is valid. */
	readonly eligible: boolean;
	readonly pending: boolean;
}

export interface WizardScopeAvailability {
	readonly scope: SettingsScope;
	readonly supported: boolean;
	readonly reasonKey: string | null;
}

export interface WizardProfileSummary {
	readonly id: string;
	readonly label?: string;
	readonly extends?: string;
}

/**
 * Renderer-neutral wizard state. Values are protocol DTOs or primitives only;
 * no macro runtime types leak into this shape.
 */
export interface ValueAuthoringWizardState {
	readonly ready: boolean;
	readonly step: WizardStepId;
	readonly guardDenials: readonly WizardGuardDenial[];
	readonly editedProfileId: string | null;
	readonly activeProfileId: string | null;
	readonly editedLabel: string | null;
	readonly editedExtendsId: string | null;
	readonly parentMissing: boolean;
	readonly scope: SettingsScope | null;
	readonly scopeAvailability: readonly WizardScopeAvailability[];
	readonly availableProfiles: readonly WizardProfileSummary[];
	/** Working copy of the edited profile's local layer. */
	readonly localProfile: ValueAuthoringProfileDto | null;
	/** Effective (inheritance-resolved) snapshot taken when the draft loaded. */
	readonly effectiveProfileSnapshot: ValueAuthoringProfileDto | null;
	/** Stable IDs contributed by resolved parents (inheritance view). */
	readonly inheritedEntryIds: Readonly<
		Record<WizardCollectionKey, readonly string[]>
	>;
	readonly baselineRevision: string | null;
	readonly dirty: boolean;
	readonly catalog: ValueCatalogDto | null;
	readonly validation: WizardValidationState;
	/** Field-keyed projection of structured diagnostics (`<step>.<field>`). */
	readonly fieldDiagnostics: Readonly<
		Record<string, readonly SettingsDiagnosticDto[]>
	>;
	readonly preview: WizardPreviewState;
	readonly provenance: ProvenanceMap;
	readonly saveState: WizardSaveState;
	readonly conflict: WizardConflictState | null;
	readonly activation: WizardActivationState;
	readonly lastError: WizardErrorState | null;
}
