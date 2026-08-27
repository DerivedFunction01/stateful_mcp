import type {
	SettingsScope,
	ValueRequestDto,
} from "@stateful-mcp/macro-protocol";
import {
	appendEntry,
	cloneProfile,
	listStableIdEntries,
	removeEntry,
	replaceEntry,
	resetToInherited as resetToInheritedOp,
	type StableIdEntryView,
	setEntryEnabled,
	updateEntry,
} from "../collections";
import type { WizardAuthoringPort } from "../port";
import {
	DEFAULT_WIZARD_DEBOUNCE_MS,
	Debouncer,
	timeoutSchedule,
	VersionedRequestTracker,
} from "../scheduler";
import type { ValueAuthoringWizardState, WizardStepId } from "../state";
import {
	evaluateStepGuards,
	GUARD_CODES,
	hasMalformedSyntaxFailure,
} from "../steps";
import { setRecipePriority } from "../steps/combinators";
import {
	editNumberWordAtom,
	editNumberWordScales,
	editNumericForm,
	editNumericOption,
	projectNumericLexicon,
} from "../steps/numerics";
import { normalizeSampleRows, normalizeSandboxRequest } from "../steps/sandbox";
import {
	buildNewLocalProfile,
	type NewLocalProfileInput,
	projectScopeProfileStep,
} from "../steps/scope-profile";
import {
	createDateTimeFormat,
	editDateTimeFormatSource,
	setDateTimeFormatEnabled,
	setDateTimeFormatPriority,
} from "../steps/templates";
import {
	emptyInheritedSets,
	type ModelRuntimeContext,
	type ValueAuthoringWizardStore,
	type WizardModelInternals,
	type WizardModelOptions,
} from "./context";
import { buildSnapshot, notify } from "./snapshot";
import {
	clearRuntimeFailures,
	ensureEditedMarker,
	executePreviewRequest,
	handleResultConflict,
	mutate,
	performSave,
	recordGuardDenial,
	refreshInheritance,
	runValidationCycle,
	schedulePreview,
	transportFailure,
} from "./transport";

/**
 * Renderer-neutral value-authoring wizard store factory. Draft mutations are
 * pure functions over protocol DTOs (`wizard/collections.ts`), navigation
 * guards are computed from state (`wizard/steps.ts`), request scheduling is
 * injected (`wizard/scheduler.ts`), and all transport flows through the
 * supplied `WizardAuthoringPort`. No React, DOM, or direct timer usage.
 */
export function createValueAuthoringWizard(
	port: WizardAuthoringPort,
	options: WizardModelOptions = {},
): ValueAuthoringWizardStore {
	const schedule = options.schedule ?? timeoutSchedule;
	const debounceMs = options.debounceMs ?? DEFAULT_WIZARD_DEBOUNCE_MS;
	const debouncer = new Debouncer(schedule, debounceMs);
	const validateTokens = new VersionedRequestTracker();
	const previewTokens = new VersionedRequestTracker();

	const s: WizardModelInternals = {
		ready: false,
		step: "scope-profile",
		guardDenials: [],
		editedProfileId: null,
		activeProfileId: options.activeProfileId ?? null,
		editedLabel: null,
		editedExtendsId: null,
		parentMissing: false,
		scope: null,
		scopeAvailability: [],
		availableProfiles: options.availableProfiles ?? [],
		baselineRevision: null,
		dirty: false,
		catalog: null,
		validation: {
			status: "idle",
			valid: null,
			diagnostics: [],
			graphFingerprint: null,
			graphStatus: "unknown",
			malformedSyntaxFailure: false,
		},
		fieldDiagnostics: {},
		preview: {
			status: "idle",
			rejectedCode: null,
			reasonKey: null,
			samples: [],
			request: null,
			results: [],
			staleCount: 0,
			selectedRecipeId: null,
			showRejected: false,
		},
		provenance: {},
		inheritedEntryIdsLists: {
			aliases: [],
			fundamentals: [],
			recipes: [],
			dateTimeFormats: [],
		},
		saveState: { kind: "idle" },
		conflict: null,
		lastError: null,
		activationAvailable: Boolean(port.activate),
		activationPending: false,
	};

	const ctx: ModelRuntimeContext = {
		options,
		port,
		debouncer,
		validateTokens,
		previewTokens,
		s,
		listeners: new Set<(next: ValueAuthoringWizardState) => void>(),
		pendingRequests: new Set<"validate" | "preview" | "save">(),
		currentLocal: null,
		loadedLocal: null,
		parentMerged: null,
		inheritedIds: emptyInheritedSets(),
		runtimeDiagnostics: [],
		latest: null as unknown as ValueAuthoringWizardState,
	};
	ctx.latest = buildSnapshot(ctx);

	let store: ValueAuthoringWizardStore;
	store = {
		getState() {
			return ctx.latest;
		},
		subscribe(listener) {
			ctx.listeners.add(listener);
			return () => {
				ctx.listeners.delete(listener);
			};
		},
		dispose() {
			ctx.debouncer.cancel();
			ctx.listeners.clear();
		},
		view: {
			scopeStep: () => projectScopeProfileStep(ctx.latest),
			numerics: () => projectNumericLexicon(ctx.currentLocal),
			stableIdEntries: (): readonly StableIdEntryView[] =>
				ctx.currentLocal && ctx.loadedLocal
					? listStableIdEntries({
							currentLocal: ctx.currentLocal,
							loadedLocal: ctx.loadedLocal,
							parentMerged: ctx.parentMerged,
							inheritedIds: ctx.inheritedIds,
						})
					: [],
		},
		actions: {
			async startEdit(profileId: string): Promise<boolean> {
				if (!profileId) return false;
				ctx.s.lastError = null;
				try {
					const result = await port.load(profileId);
					if (result.status === "loaded") {
						const stored = cloneProfile(result.draft.profile);
						clearRuntimeFailures(ctx);
						ctx.s.ready = true;
						ctx.s.dirty = false;
						ctx.s.saveState = { kind: "idle" };
						ctx.s.baselineRevision = result.settingsRevision;
						ctx.s.catalog = result.catalog ?? null;
						ctx.s.conflict = null;
						ctx.s.guardDenials = [];
						ctx.s.preview = {
							...ctx.s.preview,
							status: "idle",
							rejectedCode: null,
							reasonKey: null,
							results: [],
						};
						ctx.currentLocal = cloneProfile(stored);
						ctx.loadedLocal = cloneProfile(stored);
						ensureEditedMarker(ctx, profileId, stored);
						ctx.s.validation = {
							status: "settled",
							valid:
								result.draft.compileStatus === "invalid"
									? false
									: result.draft.compileStatus === "valid"
										? true
										: null,
							diagnostics: [...result.draft.diagnostics],
							graphFingerprint: result.draft.graphFingerprint,
							graphStatus: result.draft.compileStatus,
							malformedSyntaxFailure: hasMalformedSyntaxFailure(
								result.draft.diagnostics,
							),
						};
						refreshInheritance(ctx);
						notify(ctx);
						return true;
					}
					if (result.status === "conflict")
						handleResultConflict(ctx, result, "load", { profileId });
					notify(ctx);
					return false;
				} catch {
					transportFailure(ctx, "load", { profileId });
					notify(ctx);
					return false;
				}
			},

			startNewLocal(input: NewLocalProfileInput): boolean {
				if (!input.id) return false;
				clearRuntimeFailures(ctx);
				const shell = buildNewLocalProfile(input);
				ctx.currentLocal = cloneProfile(shell);
				ctx.loadedLocal = cloneProfile(buildNewLocalProfile({ id: input.id }));
				ctx.s.ready = true;
				ctx.s.dirty = false;
				ctx.s.baselineRevision = null;
				ctx.s.saveState = { kind: "idle" };
				ctx.s.conflict = null;
				ctx.s.guardDenials = [];
				ctx.s.validation = {
					status: "idle",
					valid: null,
					diagnostics: [],
					graphFingerprint: null,
					graphStatus: "empty",
					malformedSyntaxFailure: false,
				};
				ensureEditedMarker(ctx, input.id, shell);
				refreshInheritance(ctx);
				notify(ctx);
				return true;
			},

			goToStep(step: WizardStepId): boolean {
				if (step === ctx.s.step) return true;
				if (ctx.s.conflict && ctx.s.conflict.originStep === ctx.s.step) {
					recordGuardDenial(ctx, step, GUARD_CODES.conflictFrozen);
					notify(ctx);
					return false;
				}
				const decisions = evaluateStepGuards(ctx.latest);
				const decision = decisions[step];
				if (!decision.enterable) {
					for (const denial of decision.denials)
						recordGuardDenial(ctx, step, denial.code);
					notify(ctx);
					return false;
				}
				ctx.s.step = step;
				notify(ctx);
				return true;
			},

			chooseScope(scope: SettingsScope): boolean {
				const supported = (
					options.supportedScopes ?? ["user", "workspace", "folder"]
				).includes(scope);
				ctx.s.scopeAvailability = [
					...ctx.s.scopeAvailability.filter((item) => item.scope !== scope),
					{
						scope,
						supported,
						reasonKey: supported ? null : "settings.bundle.scopeUnsupported",
					},
				];
				if (supported) ctx.s.scope = scope;
				notify(ctx);
				return supported;
			},

			setNumericOption(key, value) {
				return mutate(ctx, (profile) => editNumericOption(profile, key, value));
			},
			toggleNumericForm(form, on) {
				return mutate(ctx, (profile) => editNumericForm(profile, form, on));
			},
			setNumberWordAtom(word, digits) {
				return mutate(ctx, (profile) =>
					editNumberWordAtom(profile, word, digits),
				);
			},
			setNumberWordScales(scales) {
				return mutate(ctx, (profile) => editNumberWordScales(profile, scales));
			},

			addToCollection(kind, entry) {
				return mutate(ctx, (profile) => appendEntry(profile, kind, entry));
			},
			replaceInCollection(kind, entry) {
				return mutate(ctx, (profile) => replaceEntry(profile, kind, entry));
			},
			removeFromCollection(kind, id) {
				return mutate(ctx, (profile) => removeEntry(profile, kind, id));
			},
			resetToInherited(kind, id) {
				return mutate(ctx, (profile) => resetToInheritedOp(profile, kind, id));
			},
			setCollectionEntryEnabled(kind, id, enabled) {
				return mutate(ctx, (profile) =>
					setEntryEnabled(profile, kind, id, enabled),
				);
			},
			updateCollectionEntry(kind, id, patch) {
				return mutate(ctx, (profile) => updateEntry(profile, kind, id, patch));
			},

			addDateTimeFormat(input) {
				return mutate(ctx, (profile) => createDateTimeFormat(profile, input));
			},
			editDateTimeFormatSource(id, source) {
				return mutate(ctx, (profile) =>
					editDateTimeFormatSource(profile, id, source),
				);
			},
			setDateTimeFormatPriority(id, priority) {
				return mutate(ctx, (profile) =>
					setDateTimeFormatPriority(profile, id, priority),
				);
			},
			setDateTimeFormatEnabled(id, enabled) {
				return mutate(ctx, (profile) =>
					setDateTimeFormatEnabled(profile, id, enabled),
				);
			},
			removeDateTimeFormat(id) {
				return mutate(ctx, (profile) =>
					removeEntry(profile, "dateTimeFormats", id),
				);
			},

			setRecipePriority(recipeId, priority) {
				return mutate(ctx, (profile) =>
					setRecipePriority(profile, recipeId, priority),
				);
			},

			setSandboxSamples(samples) {
				ctx.s.preview = {
					...ctx.s.preview,
					samples: [...normalizeSampleRows(samples)],
				};
				notify(ctx);
				return true;
			},
			setSandboxRequest(request: ValueRequestDto | null) {
				const normalized = normalizeSandboxRequest(request);
				ctx.s.preview = { ...ctx.s.preview, request: normalized };
				notify(ctx);
				return true;
			},
			selectSampleRecipe(recipeId) {
				ctx.s.preview = { ...ctx.s.preview, selectedRecipeId: recipeId };
				notify(ctx);
				return true;
			},
			showSandboxRejected(show) {
				ctx.s.preview = { ...ctx.s.preview, showRejected: show };
				notify(ctx);
				return true;
			},
			runSandbox() {
				return schedulePreview(ctx);
			},

			save() {
				return performSave(ctx);
			},

			async acknowledgeConflict(): Promise<boolean> {
				if (!ctx.s.conflict) return false;
				ctx.s.conflict = null;
				notify(ctx);
				await store.actions.refreshBaseline();
				return true;
			},

			async refreshBaseline(): Promise<boolean> {
				const profileId = ctx.s.editedProfileId;
				if (!profileId) return false;
				try {
					const result = await port.load(profileId);
					if (result.status === "loaded") {
						const stored = cloneProfile(result.draft.profile);
						ctx.loadedLocal = cloneProfile(stored);
						ctx.s.baselineRevision = result.settingsRevision;
						ctx.s.catalog = result.catalog ?? ctx.s.catalog;
						ensureEditedMarker(ctx, profileId, stored);
						if (!ctx.s.dirty) ctx.currentLocal = cloneProfile(stored);
						refreshInheritance(ctx);
						notify(ctx);
						return true;
					}
					if (result.status === "conflict")
						handleResultConflict(ctx, result, "refreshBaseline", { profileId });
					notify(ctx);
					return false;
				} catch {
					transportFailure(ctx, "refreshBaseline", { profileId });
					notify(ctx);
					return false;
				}
			},

			async retryLast(): Promise<boolean> {
				const failed = ctx.s.lastError;
				if (!failed) return false;
				ctx.s.lastError = null;
				switch (failed.op) {
					case "load":
					case "refreshBaseline":
						return store.actions.startEdit(
							failed.retryPayload?.profileId ?? ctx.s.editedProfileId ?? "",
						);
					case "validate":
						await runValidationCycle(ctx);
						return ctx.s.lastError === null;
					case "preview":
						return executePreviewRequest(ctx);
					case "save":
						return performSave(ctx);
					default:
						return false;
				}
			},

			clearLastError(): boolean {
				if (!ctx.s.lastError) return false;
				ctx.s.lastError = null;
				notify(ctx);
				return true;
			},

			async activate(expectedProjectRevision?: string): Promise<boolean> {
				if (!port.activate) return false;
				if (
					!(ctx.latest.activation.available && ctx.latest.activation.eligible)
				)
					return false;
				ctx.s.activationPending = true;
				notify(ctx);
				try {
					await port.activate(
						ctx.s.editedProfileId ?? "",
						expectedProjectRevision,
					);
					ctx.s.activeProfileId = ctx.s.editedProfileId;
					ctx.s.activationPending = false;
					notify(ctx);
					return true;
				} catch {
					ctx.s.activationPending = false;
					transportFailure(ctx, "activate");
					notify(ctx);
					return false;
				}
			},
		},
	};

	return store;
}
