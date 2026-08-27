import type {
	SettingsDiagnosticDto,
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
} from "@stateful-mcp/macro-protocol";
import {
	cloneProfile,
	entryIdsByKind,
	foldParentChain,
	isAuthoredGraphEmpty,
} from "../collections";
import { guardReasonKey, hasMalformedSyntaxFailure } from "../steps";
import {
	canRunSandboxPreview,
	SANDBOX_REJECT_CODE,
	SANDBOX_REJECT_REASON_KEY,
} from "../steps/sandbox";
import {
	emptyInheritedSets,
	type ModelRuntimeContext,
	TRANSPORT_ERROR_CODE,
	TRANSPORT_ERROR_MESSAGE_KEY,
	type WizardFailedOp,
	type WizardStepId,
} from "./context";
import { notify } from "./snapshot";

const MAX_GUARD_DENIAL_LOG = 20;

export function recordGuardDenial(
	ctx: ModelRuntimeContext,
	to: WizardStepId,
	code: string,
): void {
	ctx.s.guardDenials = [
		...ctx.s.guardDenials.slice(-(MAX_GUARD_DENIAL_LOG - 1)),
		{
			from: ctx.s.step,
			to,
			code,
			reasonKey: guardReasonKey(code),
		},
	];
}

export function setLastError(
	ctx: ModelRuntimeContext,
	op: WizardFailedOp,
	code: string,
	messageKey: string,
	messageParams?: Record<string, string | number | boolean>,
	retryPayload?: { profileId?: string },
): void {
	ctx.s.lastError = {
		op,
		code,
		messageKey,
		messageParams,
		retryable: true,
		...(retryPayload ? { retryPayload } : {}),
	};
}

export function clearRuntimeFailures(ctx: ModelRuntimeContext): void {
	ctx.runtimeDiagnostics = [];
	ctx.s.lastError = null;
}

export function transportFailure(
	ctx: ModelRuntimeContext,
	op: WizardFailedOp,
	retryPayload?: { profileId?: string },
): void {
	ctx.runtimeDiagnostics = [
		...ctx.runtimeDiagnostics,
		{
			severity: "error",
			code: TRANSPORT_ERROR_CODE,
			messageKey: TRANSPORT_ERROR_MESSAGE_KEY,
			path: [op],
		},
	];
	setLastError(
		ctx,
		op,
		TRANSPORT_ERROR_CODE,
		TRANSPORT_ERROR_MESSAGE_KEY,
		undefined,
		retryPayload,
	);
	if (op === "save" && ctx.s.saveState.kind === "saving")
		ctx.s.saveState = { kind: "idle" };
}

export function handleResultConflict(
	ctx: ModelRuntimeContext,
	result: Extract<ValueAuthoringResult, { status: "conflict" }>,
	op: WizardFailedOp,
	retryPayload?: { profileId?: string },
): void {
	if (result.code === "SETTINGS_REVISION_STALE") {
		ctx.s.conflict = {
			code: "SETTINGS_REVISION_STALE",
			messageKey: result.messageKey,
			messageParams: result.messageParams,
			expectedRevision: result.expectedRevision,
			actualRevision: result.actualRevision,
			originStep: ctx.s.step,
		};
		if (op === "save" && ctx.s.saveState.kind === "saving")
			ctx.s.saveState = { kind: "idle" };
		return;
	}
	setLastError(
		ctx,
		op,
		result.code,
		result.messageKey,
		result.messageParams as
			| Record<string, string | number | boolean>
			| undefined,
		retryPayload,
	);
}

export function applyValidationOutcome(
	ctx: ModelRuntimeContext,
	valid: boolean | null,
	diagnostics: readonly SettingsDiagnosticDto[],
	graphFingerprint: string | null,
): void {
	const authoredEmpty = isAuthoredGraphEmpty(ctx.currentLocal);
	ctx.s.validation = {
		status: "settled",
		valid,
		diagnostics: [...diagnostics],
		graphFingerprint,
		graphStatus: authoredEmpty
			? "empty"
			: valid === false
				? "invalid"
				: valid === true
					? "valid"
					: "unknown",
		malformedSyntaxFailure: hasMalformedSyntaxFailure(diagnostics),
	};
}

export function applyDraftEcho(
	ctx: ModelRuntimeContext,
	draft: {
		diagnostics?: readonly SettingsDiagnosticDto[];
		graphFingerprint?: string;
		compileStatus?: "valid" | "invalid" | "empty";
	},
): void {
	const diagnostics = [...(draft.diagnostics ?? [])];
	const valid =
		draft.compileStatus === "invalid"
			? false
			: draft.compileStatus === "valid"
				? true
				: ctx.s.validation.valid;
	applyValidationOutcome(
		ctx,
		valid,
		diagnostics,
		draft.graphFingerprint ?? null,
	);
}

export function ensureEditedMarker(
	ctx: ModelRuntimeContext,
	id: string,
	profile: ValueAuthoringProfileDto,
): void {
	ctx.s.editedProfileId = id;
	ctx.s.editedLabel =
		(typeof profile.label === "string" && profile.label) ||
		ctx.s.availableProfiles.find((candidate) => candidate.id === id)?.label ||
		null;
	ctx.s.editedExtendsId =
		typeof profile.extends === "string" ? profile.extends : null;
}

export function refreshInheritance(ctx: ModelRuntimeContext): void {
	const chain = foldParentChain(
		(parentId) => ctx.options.resolveParentProfile?.(parentId) ?? null,
		ctx.s.editedExtendsId ?? undefined,
	);
	ctx.parentMerged = chain.parentMerged;
	ctx.s.parentMissing = chain.missingAncestorId !== null;
	ctx.inheritedIds = chain.parentMerged
		? entryIdsByKind(chain.parentMerged)
		: emptyInheritedSets();
}

export async function runValidationCycle(
	ctx: ModelRuntimeContext,
): Promise<void> {
	if (!ctx.currentLocal || !ctx.s.ready) return;
	const token = ctx.validateTokens.issue();
	ctx.pendingRequests.add("validate");
	ctx.s.validation = { ...ctx.s.validation, status: "pending" };
	notify(ctx);
	try {
		const result = await ctx.port.validate(structuredClone(ctx.currentLocal));
		ctx.pendingRequests.delete("validate");
		if (!ctx.validateTokens.isCurrent(token)) return; // stale response discarded
		if (result.status === "validated") {
			clearRuntimeFailures(ctx);
			if (result.catalog) ctx.s.catalog = result.catalog;
			applyValidationOutcome(
				ctx,
				result.validation.valid,
				result.validation.diagnostics,
				result.validation.graphFingerprint,
			);
		} else if (result.status === "conflict") {
			handleResultConflict(ctx, result, "validate");
		}
	} catch {
		ctx.pendingRequests.delete("validate");
		transportFailure(ctx, "validate");
	}
	notify(ctx);
}

export async function executePreviewRequest(
	ctx: ModelRuntimeContext,
): Promise<boolean> {
	if (!ctx.currentLocal || !ctx.s.ready) return false;
	if (!canRunSandboxPreview({ validation: ctx.s.validation })) {
		rejectSandboxRun(ctx);
		return false;
	}
	ctx.s.preview = {
		...ctx.s.preview,
		status: "running",
		rejectedCode: null,
		reasonKey: null,
	};
	notify(ctx);
	const token = ctx.previewTokens.issue();
	ctx.pendingRequests.add("preview");
	try {
		const result = await ctx.port.preview(structuredClone(ctx.currentLocal), {
			samples: ctx.s.preview.samples.map((row) => ({
				input: row.input,
				...(row.argumentId !== undefined ? { argumentId: row.argumentId } : {}),
			})),
			request: ctx.s.preview.request ?? undefined,
			expectedRevision: ctx.s.baselineRevision ?? undefined,
		});
		ctx.pendingRequests.delete("preview");
		if (!ctx.previewTokens.isCurrent(token)) {
			ctx.s.preview = {
				...ctx.s.preview,
				staleCount: ctx.s.preview.staleCount + 1,
			};
			notify(ctx);
			return true;
		}
		if (result.status === "previewed") {
			ctx.s.preview = {
				...ctx.s.preview,
				status: "settled",
				results: result.preview?.samples ?? [],
			};
			applyDraftEcho(ctx, result.draft);
			notify(ctx);
			return true;
		}
		if (result.status === "conflict") {
			handleResultConflict(ctx, result, "preview");
			notify(ctx);
			return false;
		}
		notify(ctx);
		return true;
	} catch {
		ctx.pendingRequests.delete("preview");
		transportFailure(ctx, "preview");
		ctx.s.preview = { ...ctx.s.preview, status: "idle" };
		notify(ctx);
		return false;
	}
}

export function rejectSandboxRun(ctx: ModelRuntimeContext): void {
	ctx.s.preview = {
		...ctx.s.preview,
		status: "rejected",
		rejectedCode: SANDBOX_REJECT_CODE,
		reasonKey: SANDBOX_REJECT_REASON_KEY,
	};
	notify(ctx);
}

export function schedulePreview(ctx: ModelRuntimeContext): Promise<boolean> {
	if (!ctx.s.ready) return Promise.resolve(false);
	if (
		ctx.s.validation.status === "settled" &&
		ctx.s.validation.valid === false
	) {
		rejectSandboxRun(ctx);
		return Promise.resolve(false);
	}
	ctx.debouncer.trigger("preview", () => {
		void executePreviewRequest(ctx);
	});
	return Promise.resolve(true);
}

export function canSaveNow(ctx: ModelRuntimeContext): boolean {
	return (
		ctx.s.ready &&
		ctx.s.dirty &&
		ctx.currentLocal !== null &&
		ctx.s.validation.status === "settled" &&
		ctx.s.validation.valid === true &&
		ctx.pendingRequests.size === 0 &&
		ctx.s.conflict === null
	);
}

export async function performSave(ctx: ModelRuntimeContext): Promise<boolean> {
	const outgoing = ctx.currentLocal;
	if (!outgoing || !canSaveNow(ctx)) return false;
	ctx.s.saveState = { kind: "saving" };
	ctx.pendingRequests.add("save");
	notify(ctx);
	try {
		const result = await ctx.port.save(
			structuredClone(outgoing),
			ctx.s.baselineRevision ?? "",
		);
		ctx.pendingRequests.delete("save");
		switch (result.status) {
			case "saved": {
				clearRuntimeFailures(ctx);
				const saved = cloneProfile(result.draft.profile);
				ctx.currentLocal = saved;
				ctx.loadedLocal = cloneProfile(saved);
				ensureEditedMarker(ctx, ctx.s.editedProfileId ?? "", saved);
				ctx.s.baselineRevision = result.settingsRevision;
				ctx.s.dirty = false;
				ctx.s.saveState = {
					kind: "saved",
					revision: result.settingsRevision,
				};
				ctx.s.conflict = null;
				applyDraftEcho(ctx, {
					diagnostics: result.draft.diagnostics,
					graphFingerprint: result.draft.graphFingerprint,
					compileStatus: result.draft.compileStatus,
				});
				refreshInheritance(ctx);
				break;
			}
			case "blocked": {
				ctx.s.saveState = {
					kind: "blocked",
					diagnostics: [...result.diagnostics],
				};
				applyValidationOutcome(
					ctx,
					result.validation.valid,
					result.validation.diagnostics,
					result.validation.graphFingerprint,
				);
				return finish(ctx, false);
			}
			case "conflict": {
				handleResultConflict(ctx, result, "save");
				return finish(ctx, false);
			}
			default:
				return finish(ctx, false);
		}
		notify(ctx);
		return true;
	} catch {
		ctx.pendingRequests.delete("save");
		transportFailure(ctx, "save");
		notify(ctx);
		return false;
	}

	function finish(target: ModelRuntimeContext, value: boolean): boolean {
		notify(target);
		return value;
	}
}

export function commit(
	ctx: ModelRuntimeContext,
	next: ValueAuthoringProfileDto,
): void {
	ctx.currentLocal = next;
	ctx.s.dirty = true;
	ctx.debouncer.trigger("validate", () => {
		void runValidationCycle(ctx);
	});
	notify(ctx);
}

export function mutate(
	ctx: ModelRuntimeContext,
	fn: (profile: ValueAuthoringProfileDto) => ValueAuthoringProfileDto,
): boolean {
	if (!ctx.s.ready || !ctx.currentLocal) return false;
	let next: ValueAuthoringProfileDto;
	try {
		next = fn(cloneProfile(ctx.currentLocal));
	} catch {
		setLastError(
			ctx,
			"validate",
			"EDIT_REJECTED",
			"settings.diagnostic.invalidValue",
		);
		notify(ctx);
		return false;
	}
	commit(ctx, next);
	return true;
}
