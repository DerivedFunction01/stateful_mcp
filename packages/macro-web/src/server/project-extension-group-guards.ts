import type {
	ProjectExtensionGroupDraft,
	ProjectExtensionGroupPatch,
} from "@stateful-mcp/macro-protocol";

/**
 * Runtime guards for the typed Extension Activation Group host operations.
 *
 * Group editing never accepts a whole `ProjectConfigurationDto`, so each
 * operation is validated field by field here instead of being cast at the
 * boundary. A malformed payload returns `undefined` and the caller rejects the
 * request with `INVALID_REQUEST`.
 */

function record(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	return value as Record<string, unknown>;
}

function optionalString(
	value: unknown,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (typeof value !== "string") return { ok: false };
	return { ok: true, value };
}

function optionalBoolean(
	value: unknown,
): { readonly ok: true; readonly value?: boolean } | { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (typeof value !== "boolean") return { ok: false };
	return { ok: true, value };
}

function extensionIdList(
	value: unknown,
):
	| { readonly ok: true; readonly value?: readonly string[] }
	| { readonly ok: false } {
	if (value === undefined) return { ok: true };
	if (!Array.isArray(value)) return { ok: false };
	if (value.some((id) => typeof id !== "string" || id.trim().length === 0))
		return { ok: false };
	return { ok: true, value: value as readonly string[] };
}

export interface ProjectExtensionGroupPreviewRequest {
	readonly groupId?: string;
	readonly extensionIds?: readonly string[];
	readonly setActive?: boolean;
}

/** Guard for the side-effect-free `project.previewExtensionGroup` operation. */
export function parsePreviewExtensionGroup(
	value: unknown,
): ProjectExtensionGroupPreviewRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.previewExtensionGroup") return undefined;
	const groupId = optionalString(candidate.groupId);
	if (!groupId.ok) return undefined;
	if (groupId.value !== undefined && groupId.value.trim().length === 0)
		return undefined;
	const extensionIds = extensionIdList(candidate.extensionIds);
	if (!extensionIds.ok) return undefined;
	const setActive = optionalBoolean(candidate.setActive);
	if (!setActive.ok) return undefined;
	return {
		...(groupId.value === undefined ? {} : { groupId: groupId.value }),
		...(extensionIds.value === undefined
			? {}
			: { extensionIds: extensionIds.value }),
		...(setActive.value === undefined ? {} : { setActive: setActive.value }),
	};
}

export interface ProjectExtensionGroupUpdateRequest {
	readonly patch: ProjectExtensionGroupPatch;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/** Guard for `project.updateExtensionGroup`. */
export function parseUpdateExtensionGroup(
	value: unknown,
): ProjectExtensionGroupUpdateRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.updateExtensionGroup") return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	const patchValue = record(candidate.patch);
	if (!patchValue) return undefined;
	if (
		typeof patchValue.groupId !== "string" ||
		patchValue.groupId.trim().length === 0
	)
		return undefined;
	const displayName = optionalString(patchValue.displayName);
	if (!displayName.ok) return undefined;
	const description = optionalString(patchValue.description);
	if (!description.ok) return undefined;
	const extensionIds = extensionIdList(patchValue.extensionIds);
	if (!extensionIds.ok) return undefined;
	const setActive = optionalBoolean(patchValue.setActive);
	if (!setActive.ok) return undefined;
	const apply = optionalBoolean(candidate.apply);
	if (!apply.ok) return undefined;
	return {
		patch: {
			groupId: patchValue.groupId,
			...(displayName.value === undefined
				? {}
				: { displayName: displayName.value }),
			...(description.value === undefined
				? {}
				: { description: description.value }),
			...(extensionIds.value === undefined
				? {}
				: { extensionIds: extensionIds.value }),
			...(setActive.value === undefined ? {} : { setActive: setActive.value }),
		},
		expectedRevision: candidate.expectedRevision,
		...(apply.value === undefined ? {} : { apply: apply.value }),
	};
}

export interface ProjectExtensionGroupCreateRequest {
	readonly group: ProjectExtensionGroupDraft;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/** Guard for `project.createExtensionGroup`. */
export function parseCreateExtensionGroup(
	value: unknown,
): ProjectExtensionGroupCreateRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.createExtensionGroup") return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	const draft = record(candidate.group);
	if (!draft) return undefined;
	if (
		typeof draft.displayName !== "string" ||
		draft.displayName.trim().length === 0
	)
		return undefined;
	const groupId = optionalString(draft.groupId);
	if (!groupId.ok) return undefined;
	const description = optionalString(draft.description);
	if (!description.ok) return undefined;
	const extensionIds = extensionIdList(draft.extensionIds);
	if (!extensionIds.ok) return undefined;
	const setActive = optionalBoolean(draft.setActive);
	if (!setActive.ok) return undefined;
	const apply = optionalBoolean(candidate.apply);
	if (!apply.ok) return undefined;
	return {
		group: {
			displayName: draft.displayName,
			...(groupId.value === undefined ? {} : { groupId: groupId.value }),
			...(description.value === undefined
				? {}
				: { description: description.value }),
			...(extensionIds.value === undefined
				? {}
				: { extensionIds: extensionIds.value }),
			...(setActive.value === undefined ? {} : { setActive: setActive.value }),
		},
		expectedRevision: candidate.expectedRevision,
		...(apply.value === undefined ? {} : { apply: apply.value }),
	};
}

export interface ProjectExtensionGroupDuplicateRequest {
	readonly sourceGroupId: string;
	readonly displayName?: string;
	readonly groupId?: string;
	readonly setActive?: boolean;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/** Guard for `project.duplicateExtensionGroup`. */
export function parseDuplicateExtensionGroup(
	value: unknown,
): ProjectExtensionGroupDuplicateRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.duplicateExtensionGroup")
		return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	if (
		typeof candidate.sourceGroupId !== "string" ||
		candidate.sourceGroupId.trim().length === 0
	)
		return undefined;
	const displayName = optionalString(candidate.displayName);
	if (!displayName.ok) return undefined;
	const groupId = optionalString(candidate.groupId);
	if (!groupId.ok) return undefined;
	const setActive = optionalBoolean(candidate.setActive);
	if (!setActive.ok) return undefined;
	const apply = optionalBoolean(candidate.apply);
	if (!apply.ok) return undefined;
	return {
		sourceGroupId: candidate.sourceGroupId,
		...(displayName.value === undefined
			? {}
			: { displayName: displayName.value }),
		...(groupId.value === undefined ? {} : { groupId: groupId.value }),
		...(setActive.value === undefined ? {} : { setActive: setActive.value }),
		expectedRevision: candidate.expectedRevision,
		...(apply.value === undefined ? {} : { apply: apply.value }),
	};
}

export interface ProjectExtensionGroupDeleteRequest {
	readonly groupId: string;
	readonly replacementGroupId?: string;
	readonly clearActive?: boolean;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/** Guard for `project.deleteExtensionGroup`. */
export function parseDeleteExtensionGroup(
	value: unknown,
): ProjectExtensionGroupDeleteRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.deleteExtensionGroup") return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	if (
		typeof candidate.groupId !== "string" ||
		candidate.groupId.trim().length === 0
	)
		return undefined;
	const replacementGroupId = optionalString(candidate.replacementGroupId);
	if (!replacementGroupId.ok) return undefined;
	const clearActive = optionalBoolean(candidate.clearActive);
	if (!clearActive.ok) return undefined;
	const apply = optionalBoolean(candidate.apply);
	if (!apply.ok) return undefined;
	return {
		groupId: candidate.groupId,
		...(replacementGroupId.value === undefined
			? {}
			: { replacementGroupId: replacementGroupId.value }),
		...(clearActive.value === undefined
			? {}
			: { clearActive: clearActive.value }),
		expectedRevision: candidate.expectedRevision,
		...(apply.value === undefined ? {} : { apply: apply.value }),
	};
}

export interface ProjectSetActiveExtensionGroupRequest {
	/** `null` clears the active group. */
	readonly groupId: string | null;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/** Guard for `project.setActiveExtensionGroup`. */
export function parseSetActiveExtensionGroup(
	value: unknown,
): ProjectSetActiveExtensionGroupRequest | undefined {
	const candidate = record(value);
	if (!candidate) return undefined;
	if (candidate.operation !== "project.setActiveExtensionGroup")
		return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	if (candidate.groupId !== null && typeof candidate.groupId !== "string")
		return undefined;
	if (typeof candidate.groupId === "string" && !candidate.groupId.trim())
		return undefined;
	const apply = optionalBoolean(candidate.apply);
	if (!apply.ok) return undefined;
	return {
		groupId: candidate.groupId,
		expectedRevision: candidate.expectedRevision,
		...(apply.value === undefined ? {} : { apply: apply.value }),
	};
}
