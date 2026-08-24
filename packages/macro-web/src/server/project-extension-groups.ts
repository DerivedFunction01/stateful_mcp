import {
	computeProjectExtensionGroupImpact,
	isReadOnlyProjectExtensionGroup,
	normalizeExtensionMembership,
	PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES,
	type ProjectExtensionActivationGroup,
	type ProjectExtensionActivationGroupMap,
	type ProjectExtensionCatalogEntry,
	type ProjectExtensionGroupDiagnostic,
	type ProjectExtensionGroupResolution,
	resolveProjectExtensionGroup,
	sanitizeProjectExtensionGroupId,
	uniqueProjectExtensionGroupId,
	validateProjectExtensionGroups,
} from "@stateful-mcp/macro";
import type {
	ProjectExtensionActivationGroupDto,
	ProjectExtensionAvailabilityDto,
	ProjectExtensionCapabilitiesDto,
	ProjectExtensionDescriptorDto,
	ProjectExtensionGroupDiagnosticDto,
	ProjectExtensionGroupDraft,
	ProjectExtensionGroupImpactDto,
	ProjectExtensionGroupPatch,
	ProjectExtensionGroupResolutionDto,
} from "@stateful-mcp/macro-protocol";

/**
 * Host-boundary logic for Extension Activation Groups.
 *
 * Everything here is pure: it turns a current group map plus one requested
 * change into either a validated next group map or structured diagnostics. The
 * session manager owns persistence, reload, and revision handling, so this
 * module is unit-testable without a running workspace.
 */

export type ProjectExtensionGroupChange =
	| { readonly kind: "create"; readonly group: ProjectExtensionGroupDraft }
	| { readonly kind: "update"; readonly patch: ProjectExtensionGroupPatch }
	| {
			readonly kind: "duplicate";
			readonly sourceGroupId: string;
			readonly displayName?: string;
			readonly groupId?: string;
			readonly setActive?: boolean;
	  }
	| {
			readonly kind: "delete";
			readonly groupId: string;
			readonly replacementGroupId?: string;
			readonly clearActive?: boolean;
	  }
	| { readonly kind: "setActive"; readonly groupId: string | null };

export interface ProjectExtensionGroupState {
	readonly groups: ProjectExtensionActivationGroupMap;
	readonly activeGroupId?: string;
}

export interface ProjectExtensionGroupPlan extends ProjectExtensionGroupState {
	/** Group the change is about. Unset when the active group was only cleared. */
	readonly groupId?: string;
	/** Non-blocking diagnostics produced while planning. */
	readonly diagnostics: readonly ProjectExtensionGroupDiagnostic[];
}

export type ProjectExtensionGroupPlanResult =
	| { readonly ok: true; readonly plan: ProjectExtensionGroupPlan }
	| {
			readonly ok: false;
			readonly diagnostics: readonly ProjectExtensionGroupDiagnostic[];
	  };

function error(
	code: string,
	message: string,
	extra: { readonly groupId?: string; readonly extensionId?: string } = {},
): ProjectExtensionGroupDiagnostic {
	return {
		code,
		severity: "error",
		message,
		...(extra.groupId === undefined ? {} : { groupId: extra.groupId }),
		...(extra.extensionId === undefined
			? {}
			: { extensionId: extra.extensionId }),
	};
}

/** Raised when the active group is deleted without a replacement decision. */
export const ACTIVE_GROUP_REPLACEMENT_REQUIRED =
	"project.extensionGroup.activeGroupReplacementRequired";

/**
 * Plans one group change against the current state.
 *
 * Group identity is stable: renaming only changes `displayName`. Read-only
 * (built-in or extension-contributed) groups can be duplicated but never edited
 * or deleted, and deleting the active group requires either an explicit
 * replacement or an explicit clear so `activeExtensionGroupId` can never point
 * at a deleted group.
 */
export function planProjectExtensionGroupChange(
	state: ProjectExtensionGroupState,
	change: ProjectExtensionGroupChange,
): ProjectExtensionGroupPlanResult {
	const groups: Record<string, ProjectExtensionActivationGroup> = {
		...state.groups,
	};
	const diagnostics: ProjectExtensionGroupDiagnostic[] = [];
	let activeGroupId = state.activeGroupId;

	switch (change.kind) {
		case "create": {
			const displayName = change.group.displayName.trim();
			if (!displayName)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.emptyDisplayName,
							"An extension activation group requires a display name",
						),
					],
				};
			const requestedId = change.group.groupId
				? sanitizeProjectExtensionGroupId(change.group.groupId)
				: undefined;
			if (change.group.groupId !== undefined && !requestedId)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.invalidGroupId,
							`Extension activation group id '${change.group.groupId}' is not a valid identifier`,
							{ groupId: change.group.groupId },
						),
					],
				};
			if (requestedId && Object.hasOwn(groups, requestedId))
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.duplicateGroupId,
							`Extension activation group '${requestedId}' already exists`,
							{ groupId: requestedId },
						),
					],
				};
			const groupId =
				requestedId ??
				uniqueProjectExtensionGroupId(displayName, Object.keys(groups));
			const created: ProjectExtensionActivationGroup = {
				id: groupId,
				displayName,
				...(change.group.description?.trim()
					? { description: change.group.description.trim() }
					: {}),
				extensionIds: normalizeExtensionMembership(
					change.group.extensionIds ?? [],
				),
				source: "project",
				readOnly: false,
			};
			groups[groupId] = created;
			if (change.group.setActive) activeGroupId = groupId;
			return {
				ok: true,
				plan: {
					groups,
					...(activeGroupId === undefined ? {} : { activeGroupId }),
					groupId,
					diagnostics,
				},
			};
		}
		case "update": {
			const existing = groups[change.patch.groupId];
			if (!existing)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownGroup,
							`Extension activation group '${change.patch.groupId}' does not exist`,
							{ groupId: change.patch.groupId },
						),
					],
				};
			if (isReadOnlyProjectExtensionGroup(existing))
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.readOnlyGroup,
							`Extension activation group '${existing.id}' is read-only and must be duplicated before editing`,
							{ groupId: existing.id },
						),
					],
				};
			if (
				change.patch.displayName !== undefined &&
				!change.patch.displayName.trim()
			)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.emptyDisplayName,
							`Extension activation group '${existing.id}' requires a display name`,
							{ groupId: existing.id },
						),
					],
				};
			const description =
				change.patch.description === undefined
					? existing.description
					: change.patch.description.trim() || undefined;
			groups[existing.id] = {
				id: existing.id,
				displayName: change.patch.displayName?.trim() ?? existing.displayName,
				...(description === undefined ? {} : { description }),
				extensionIds:
					change.patch.extensionIds === undefined
						? existing.extensionIds
						: normalizeExtensionMembership(change.patch.extensionIds),
				source: existing.source,
				readOnly: existing.readOnly ?? false,
			};
			if (change.patch.setActive === true) activeGroupId = existing.id;
			if (change.patch.setActive === false && activeGroupId === existing.id)
				activeGroupId = undefined;
			return {
				ok: true,
				plan: {
					groups,
					...(activeGroupId === undefined ? {} : { activeGroupId }),
					groupId: existing.id,
					diagnostics,
				},
			};
		}
		case "duplicate": {
			const source = groups[change.sourceGroupId];
			if (!source)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownSourceGroup,
							`Extension activation group '${change.sourceGroupId}' does not exist`,
							{ groupId: change.sourceGroupId },
						),
					],
				};
			const displayName =
				change.displayName?.trim() || `${source.displayName} (copy)`;
			const requestedId = change.groupId
				? sanitizeProjectExtensionGroupId(change.groupId)
				: undefined;
			if (change.groupId !== undefined && !requestedId)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.invalidGroupId,
							`Extension activation group id '${change.groupId}' is not a valid identifier`,
							{ groupId: change.groupId },
						),
					],
				};
			if (requestedId && Object.hasOwn(groups, requestedId))
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.duplicateGroupId,
							`Extension activation group '${requestedId}' already exists`,
							{ groupId: requestedId },
						),
					],
				};
			const groupId =
				requestedId ??
				uniqueProjectExtensionGroupId(`${source.id}-copy`, Object.keys(groups));
			groups[groupId] = {
				id: groupId,
				displayName,
				...(source.description === undefined
					? {}
					: { description: source.description }),
				extensionIds: normalizeExtensionMembership(source.extensionIds),
				// A duplicate is always an editable project group, even when the
				// source was a contributed read-only catalog entry.
				source: "project",
				readOnly: false,
			};
			if (change.setActive) activeGroupId = groupId;
			return {
				ok: true,
				plan: {
					groups,
					...(activeGroupId === undefined ? {} : { activeGroupId }),
					groupId,
					diagnostics,
				},
			};
		}
		case "delete": {
			const existing = groups[change.groupId];
			if (!existing)
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownGroup,
							`Extension activation group '${change.groupId}' does not exist`,
							{ groupId: change.groupId },
						),
					],
				};
			if (isReadOnlyProjectExtensionGroup(existing))
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.readOnlyGroup,
							`Extension activation group '${existing.id}' is read-only and cannot be deleted`,
							{ groupId: existing.id },
						),
					],
				};
			if (activeGroupId === existing.id) {
				if (change.replacementGroupId !== undefined) {
					if (change.replacementGroupId === existing.id)
						return {
							ok: false,
							diagnostics: [
								error(
									ACTIVE_GROUP_REPLACEMENT_REQUIRED,
									"The replacement group must differ from the deleted group",
									{ groupId: existing.id },
								),
							],
						};
					if (!Object.hasOwn(groups, change.replacementGroupId))
						return {
							ok: false,
							diagnostics: [
								error(
									PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownGroup,
									`Replacement extension activation group '${change.replacementGroupId}' does not exist`,
									{ groupId: change.replacementGroupId },
								),
							],
						};
					activeGroupId = change.replacementGroupId;
				} else if (change.clearActive === true) {
					activeGroupId = undefined;
					diagnostics.push({
						code: ACTIVE_GROUP_REPLACEMENT_REQUIRED,
						severity: "warning",
						groupId: existing.id,
						message:
							"The active extension activation group was cleared; every declared extension will activate",
					});
				} else
					return {
						ok: false,
						diagnostics: [
							error(
								ACTIVE_GROUP_REPLACEMENT_REQUIRED,
								`Extension activation group '${existing.id}' is active: choose a replacement group or clear the active group explicitly`,
								{ groupId: existing.id },
							),
						],
					};
			}
			delete groups[existing.id];
			return {
				ok: true,
				plan: {
					groups,
					...(activeGroupId === undefined ? {} : { activeGroupId }),
					groupId: existing.id,
					diagnostics,
				},
			};
		}
		case "setActive": {
			if (change.groupId === null)
				return { ok: true, plan: { groups, diagnostics } };
			if (!Object.hasOwn(groups, change.groupId))
				return {
					ok: false,
					diagnostics: [
						error(
							PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownActiveGroup,
							`Extension activation group '${change.groupId}' does not exist`,
							{ groupId: change.groupId },
						),
					],
				};
			return {
				ok: true,
				plan: {
					groups,
					activeGroupId: change.groupId,
					groupId: change.groupId,
					diagnostics,
				},
			};
		}
	}
}

/**
 * Validates a planned group map for persistence. Returns blocking error
 * diagnostics; warnings and info are returned to the caller separately by the
 * resolution.
 */
export function validatePlannedExtensionGroups(
	plan: ProjectExtensionGroupState,
	extensions: readonly ProjectExtensionCatalogEntry[],
	reservedGroupIds: readonly string[] = [],
): readonly ProjectExtensionGroupDiagnostic[] {
	return validateProjectExtensionGroups({
		groups: plan.groups,
		extensions,
		reservedGroupIds,
		...(plan.activeGroupId === undefined
			? {}
			: { activeGroupId: plan.activeGroupId }),
	});
}

/** Resolves the group that a state activates, honouring "no active group". */
export function resolveActiveExtensionGroup(
	state: ProjectExtensionGroupState,
	extensions: readonly ProjectExtensionCatalogEntry[],
): ProjectExtensionGroupResolution {
	return resolveProjectExtensionGroup({
		extensions,
		groups: state.groups,
		...(state.activeGroupId === undefined
			? {}
			: { groupId: state.activeGroupId }),
	});
}

/** Impact of moving from one activation state to another. */
export function extensionGroupImpact(
	current: ProjectExtensionGroupResolution,
	proposed: ProjectExtensionGroupResolution,
): ProjectExtensionGroupImpactDto {
	return computeProjectExtensionGroupImpact(
		current.activationOrder,
		proposed.activationOrder,
	);
}

export function toProjectExtensionGroupDto(
	group: ProjectExtensionActivationGroup,
): ProjectExtensionActivationGroupDto {
	return {
		id: group.id,
		displayName: group.displayName,
		...(group.description === undefined
			? {}
			: { description: group.description }),
		extensionIds: [...group.extensionIds],
		source: group.source,
		...(group.readOnly === undefined ? {} : { readOnly: group.readOnly }),
	};
}

export function toProjectExtensionGroupDiagnosticDto(
	diagnostic: ProjectExtensionGroupDiagnostic,
): ProjectExtensionGroupDiagnosticDto {
	return {
		code: diagnostic.code,
		severity: diagnostic.severity,
		message: diagnostic.message,
		...(diagnostic.groupId === undefined
			? {}
			: { groupId: diagnostic.groupId }),
		...(diagnostic.extensionId === undefined
			? {}
			: { extensionId: diagnostic.extensionId }),
		...(diagnostic.dependencyId === undefined
			? {}
			: { dependencyId: diagnostic.dependencyId }),
		...(diagnostic.path === undefined ? {} : { path: [...diagnostic.path] }),
	};
}

export function toProjectExtensionGroupResolutionDto(
	resolution: ProjectExtensionGroupResolution,
): ProjectExtensionGroupResolutionDto {
	return {
		...(resolution.groupId === undefined
			? {}
			: { groupId: resolution.groupId }),
		directExtensionIds: [...resolution.directExtensionIds],
		resolvedExtensionIds: [...resolution.resolvedExtensionIds],
		automaticallyIncludedExtensionIds: [
			...resolution.automaticallyIncludedExtensionIds,
		],
		excludedExtensionIds: [...resolution.excludedExtensionIds],
		unknownExtensionIds: [...resolution.unknownExtensionIds],
		unavailableExtensionIds: [...resolution.unavailableExtensionIds],
		activationOrder: [...resolution.activationOrder],
		memberships: resolution.memberships.map((membership) => ({
			extensionId: membership.extensionId,
			kind: membership.kind,
			requiredBy: [...membership.requiredBy],
			availability: membership.availability,
		})),
		diagnostics: resolution.diagnostics.map(
			toProjectExtensionGroupDiagnosticDto,
		),
		valid: resolution.valid,
	};
}

const EMPTY_CAPABILITIES: ProjectExtensionCapabilitiesDto = {
	macros: [],
	commands: [],
	views: [],
	tabs: [],
	settings: [],
	projectSettings: [],
	resources: [],
	migrationParticipants: [],
};

/** Capability identity of one active extension, collected by the host. */
export interface ActiveExtensionCapabilityInput {
	readonly id: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly capabilities: Partial<ProjectExtensionCapabilitiesDto>;
}

export interface BuildProjectExtensionCatalogInput {
	readonly declared: readonly {
		readonly id: string;
		readonly source: string;
		readonly version: string;
		readonly requires?: readonly string[];
	}[];
	readonly active: readonly ActiveExtensionCapabilityInput[];
	/** Availability overrides derived from activation diagnostics. */
	readonly availability?: Readonly<
		Record<string, ProjectExtensionAvailabilityDto>
	>;
	readonly diagnostics?: Readonly<
		Record<string, readonly ProjectExtensionGroupDiagnosticDto[]>
	>;
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))].sort(
		(left, right) => (left < right ? -1 : left > right ? 1 : 0),
	);
}

/**
 * Projects the read-only extension catalog. Capability lists come from active
 * contributions and registered project metadata, never from browser-side
 * manifest inspection, so UI counts are host-authoritative.
 */
export function buildProjectExtensionCatalog(
	input: BuildProjectExtensionCatalogInput,
): readonly ProjectExtensionDescriptorDto[] {
	const activeById = new Map(
		input.active.map((extension) => [extension.id, extension]),
	);
	return input.declared.map((declared): ProjectExtensionDescriptorDto => {
		const active = activeById.get(declared.id);
		const capabilities = active?.capabilities ?? {};
		return {
			id: declared.id,
			source: declared.source,
			version: declared.version,
			...(active?.displayName === undefined
				? {}
				: { displayName: active.displayName }),
			...(active?.description === undefined
				? {}
				: { description: active.description }),
			requires: [...(declared.requires ?? [])],
			availability: input.availability?.[declared.id] ?? "available",
			active: active !== undefined,
			capabilities: {
				macros: sortedUnique(capabilities.macros ?? EMPTY_CAPABILITIES.macros),
				commands: sortedUnique(
					capabilities.commands ?? EMPTY_CAPABILITIES.commands,
				),
				views: sortedUnique(capabilities.views ?? EMPTY_CAPABILITIES.views),
				tabs: sortedUnique(capabilities.tabs ?? EMPTY_CAPABILITIES.tabs),
				settings: sortedUnique(
					capabilities.settings ?? EMPTY_CAPABILITIES.settings,
				),
				projectSettings: sortedUnique(
					capabilities.projectSettings ?? EMPTY_CAPABILITIES.projectSettings,
				),
				resources: sortedUnique(
					capabilities.resources ?? EMPTY_CAPABILITIES.resources,
				),
				migrationParticipants: sortedUnique(
					capabilities.migrationParticipants ??
						EMPTY_CAPABILITIES.migrationParticipants,
				),
			},
			diagnostics: input.diagnostics?.[declared.id] ?? [],
		};
	});
}

/** Resolver input projection for a declared extension list. */
export function toResolverExtensions(
	declared: readonly {
		readonly id: string;
		readonly requires?: readonly string[];
	}[],
	availability?: Readonly<Record<string, ProjectExtensionAvailabilityDto>>,
): readonly ProjectExtensionCatalogEntry[] {
	return declared.map((extension) => ({
		id: extension.id,
		...(extension.requires === undefined
			? {}
			: { requires: [...extension.requires] }),
		...(availability?.[extension.id] === undefined
			? {}
			: { availability: availability[extension.id] }),
	}));
}
