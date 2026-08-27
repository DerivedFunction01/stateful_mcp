import type {
	SettingsDiagnosticDto,
	ValueAuthoringProfileDto,
	ValueCatalogDto,
} from "@stateful-mcp/macro-protocol";
import {
	cloneProfile,
	computeEffectiveSnapshot,
	deriveProvenance,
} from "../collections";
import { projectFieldDiagnostics } from "../diagnostics";
import type { ModelRuntimeContext, ValueAuthoringWizardState } from "./context";

/** Merged diagnostic channel: validation + blocked-save + runtime failures. */
export function mergedDiagnosticChannel(
	ctx: ModelRuntimeContext,
): readonly SettingsDiagnosticDto[] {
	return [
		...ctx.s.validation.diagnostics,
		...(ctx.s.saveState.kind === "blocked" ? ctx.s.saveState.diagnostics : []),
		...ctx.runtimeDiagnostics,
	];
}

/**
 * Builds the frozen, renderer-neutral snapshot from the current internal
 * state. Pure with respect to the supplied context: no side effects beyond
 * reading `ctx`.
 */
export function buildSnapshot(
	ctx: ModelRuntimeContext,
): ValueAuthoringWizardState {
	const provenance =
		ctx.currentLocal && ctx.loadedLocal
			? deriveProvenance({
					currentLocal: ctx.currentLocal,
					loadedLocal: ctx.loadedLocal,
					inheritedIds: ctx.inheritedIds,
				})
			: {};
	const frozenInherited = {
		aliases: Object.freeze([...ctx.inheritedIds.aliases].sort()),
		fundamentals: Object.freeze([...ctx.inheritedIds.fundamentals].sort()),
		recipes: Object.freeze([...ctx.inheritedIds.recipes].sort()),
		dateTimeFormats: Object.freeze(
			[...ctx.inheritedIds.dateTimeFormats].sort(),
		),
	};
	const eligible =
		ctx.s.ready &&
		ctx.s.editedProfileId !== null &&
		ctx.s.editedProfileId !== ctx.s.activeProfileId &&
		ctx.s.validation.status === "settled" &&
		ctx.s.validation.valid === true;
	return Object.freeze({
		ready: ctx.s.ready,
		step: ctx.s.step,
		guardDenials: Object.freeze(
			ctx.s.guardDenials.map((denial) => Object.freeze({ ...denial })),
		),
		editedProfileId: ctx.s.editedProfileId,
		activeProfileId: ctx.s.activeProfileId,
		editedLabel: ctx.s.editedLabel,
		editedExtendsId: ctx.s.editedExtendsId,
		parentMissing: ctx.s.parentMissing,
		scope: ctx.s.scope,
		scopeAvailability: Object.freeze(
			ctx.s.scopeAvailability.map((item) => Object.freeze({ ...item })),
		),
		availableProfiles: Object.freeze(
			ctx.s.availableProfiles.map((profile) => Object.freeze({ ...profile })),
		),
		localProfile: ctx.currentLocal
			? Object.freeze(cloneProfile(ctx.currentLocal))
			: null,
		effectiveProfileSnapshot: effectiveSnapshotView(ctx),
		inheritedEntryIds: Object.freeze(frozenInherited),
		baselineRevision: ctx.s.baselineRevision,
		dirty: ctx.s.dirty,
		catalog: ctx.s.catalog ? cloneCatalogView(ctx.s.catalog) : null,
		validation: Object.freeze({
			...ctx.s.validation,
			diagnostics: Object.freeze([...ctx.s.validation.diagnostics]),
		}),
		fieldDiagnostics: Object.freeze(
			Object.fromEntries(
				Object.entries(
					projectFieldDiagnostics(mergedDiagnosticChannel(ctx)),
				).map(([key, list]) => [key, Object.freeze([...list])]),
			),
		),
		preview: Object.freeze({
			...ctx.s.preview,
			previewPersisted: false as const,
			samples: Object.freeze(
				ctx.s.preview.samples.map((row) => Object.freeze({ ...row })),
			),
			results: Object.freeze([...ctx.s.preview.results]),
			request: ctx.s.preview.request,
		}),
		provenance: Object.freeze({ ...provenance }),
		saveState:
			ctx.s.saveState.kind === "saved"
				? Object.freeze({ kind: "saved", revision: ctx.s.saveState.revision })
				: ctx.s.saveState.kind === "blocked"
					? Object.freeze({
							kind: "blocked",
							diagnostics: Object.freeze([...ctx.s.saveState.diagnostics]),
						})
					: Object.freeze({ kind: ctx.s.saveState.kind }),
		conflict: ctx.s.conflict,
		activation: Object.freeze({
			available: ctx.s.activationAvailable,
			eligible,
			pending: ctx.s.activationPending,
		}),
		lastError: ctx.s.lastError,
	});
}

/** Effective (inheritance-resolved) snapshot of the current local layer. */
export function effectiveSnapshotView(
	ctx: ModelRuntimeContext,
): ValueAuthoringProfileDto | null {
	const base = ctx.currentLocal ?? ctx.loadedLocal;
	if (!base && !ctx.parentMerged) return null;
	if (!base) return null;
	return Object.freeze(
		computeEffectiveSnapshot(cloneProfile(base), ctx.parentMerged),
	);
}

/** Deep clone of the catalog view (kept independent of working state). */
export function cloneCatalogView(catalog: ValueCatalogDto): ValueCatalogDto {
	return structuredClone(catalog);
}

/** Recomputes the frozen snapshot and pushes it to every subscriber. */
export function notify(ctx: ModelRuntimeContext): void {
	ctx.latest = buildSnapshot(ctx);
	for (const listener of [...ctx.listeners]) listener(ctx.latest);
}
