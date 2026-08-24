/**
 * Canonical Extension Activation Group resolver.
 *
 * Activation groups are project-owned selections of declared extensions. The
 * persisted membership only records *direct* selections; dependency closure,
 * activation order, and diagnostics are derived here so workspace loading,
 * project validation, group preview, DTO projection, and reload-impact
 * calculation all agree on one algorithm. The browser never re-implements it.
 */

import {
	PROJECT_EXTENSION_GROUP_SOURCES,
	type ProjectExtensionActivationGroup,
	type ProjectExtensionActivationGroupMap,
} from "./contracts";

export type ProjectExtensionGroupDiagnosticSeverity =
	| "info"
	| "warning"
	| "error";

/** Stable diagnostic codes. Callers branch on `code`, never on `message`. */
export const PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES = {
	unknownGroup: "project.extensionGroup.unknownGroup",
	unknownActiveGroup: "project.extensionGroup.unknownActiveGroup",
	unknownExtension: "project.extensionGroup.unknownExtension",
	missingDependency: "project.extensionGroup.missingDependency",
	dependencyCycle: "project.extensionGroup.dependencyCycle",
	duplicateMember: "project.extensionGroup.duplicateMember",
	unavailableExtension: "project.extensionGroup.unavailableExtension",
	incompatibleExtension: "project.extensionGroup.incompatibleExtension",
	emptyGroup: "project.extensionGroup.emptyGroup",
	groupIdMismatch: "project.extensionGroup.groupIdMismatch",
	invalidGroupId: "project.extensionGroup.invalidGroupId",
	reservedGroupId: "project.extensionGroup.reservedGroupId",
	duplicateGroupId: "project.extensionGroup.duplicateGroupId",
	emptyDisplayName: "project.extensionGroup.emptyDisplayName",
	invalidSource: "project.extensionGroup.invalidSource",
	invalidMembership: "project.extensionGroup.invalidMembership",
	readOnlyGroup: "project.extensionGroup.readOnlyGroup",
	unknownSourceGroup: "project.extensionGroup.unknownSourceGroup",
} as const;

export type ProjectExtensionGroupDiagnosticCode =
	(typeof PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES)[keyof typeof PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES];

export interface ProjectExtensionGroupDiagnostic {
	readonly code: string;
	readonly severity: ProjectExtensionGroupDiagnosticSeverity;
	readonly groupId?: string;
	readonly extensionId?: string;
	readonly dependencyId?: string;
	readonly path?: readonly string[];
	readonly message: string;
	/** Structured message key; preferred over `message` when present. */
	readonly messageKey?: string;
	readonly messageParams?: Readonly<
		Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
	>;
}

export type ProjectExtensionAvailability =
	| "available"
	| "missing"
	| "incompatible";

/** The minimal extension identity the resolver needs. */
export interface ProjectExtensionCatalogEntry {
	readonly id: string;
	readonly requires?: readonly string[];
	readonly availability?: ProjectExtensionAvailability;
}

export type ProjectExtensionMembershipKind = "direct" | "automatic";

export interface ProjectExtensionGroupMembership {
	readonly extensionId: string;
	readonly kind: ProjectExtensionMembershipKind;
	/** Resolved members that require this extension, sorted for stability. */
	readonly requiredBy: readonly string[];
	readonly availability: ProjectExtensionAvailability;
}

export interface ProjectExtensionGroupResolution {
	readonly groupId?: string;
	readonly directExtensionIds: readonly string[];
	readonly resolvedExtensionIds: readonly string[];
	readonly automaticallyIncludedExtensionIds: readonly string[];
	/** Declared extensions the group does not activate. */
	readonly excludedExtensionIds: readonly string[];
	/** Members that are not declared by the project at all. */
	readonly unknownExtensionIds: readonly string[];
	/** Resolved members whose availability is `missing` or `incompatible`. */
	readonly unavailableExtensionIds: readonly string[];
	readonly activationOrder: readonly string[];
	readonly memberships: readonly ProjectExtensionGroupMembership[];
	readonly diagnostics: readonly ProjectExtensionGroupDiagnostic[];
	readonly valid: boolean;
}

export interface ProjectExtensionGroupImpact {
	readonly requiresReload: boolean;
	readonly activatedExtensionIds: readonly string[];
	readonly deactivatedExtensionIds: readonly string[];
	readonly unchangedExtensionIds: readonly string[];
}

export interface ResolveProjectExtensionGroupInput {
	/** Group to resolve. When omitted, every declared extension is selected. */
	readonly groupId?: string;
	readonly groups?: ProjectExtensionActivationGroupMap;
	readonly extensions: readonly ProjectExtensionCatalogEntry[];
	/**
	 * Staged direct membership, used to preview unsaved edits without mutating
	 * the persisted group map. Takes precedence over the group's membership.
	 */
	readonly directExtensionIds?: readonly string[];
}

export interface ValidateProjectExtensionGroupsInput {
	readonly groups?: ProjectExtensionActivationGroupMap;
	readonly activeGroupId?: string;
	readonly extensions: readonly ProjectExtensionCatalogEntry[];
	/** Contributed/built-in identifiers that project groups must not shadow. */
	readonly reservedGroupIds?: readonly string[];
}

const GROUP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function byId(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** Deterministic, deduplicated direct-membership projection. */
export function normalizeExtensionMembership(
	extensionIds: readonly string[],
): readonly string[] {
	return [
		...new Set(
			extensionIds.map((id) => id.trim()).filter((id) => id.length > 0),
		),
	].sort(byId);
}

/** Sanitizes a display name into a stable group identifier. */
export function sanitizeProjectExtensionGroupId(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9._-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^[-._]+|[-._]+$/g, "");
}

export function isValidProjectExtensionGroupId(id: string): boolean {
	return GROUP_ID_PATTERN.test(id);
}

/**
 * Derives a free identifier from a seed, appending `-2`, `-3`, ... on
 * collision. Used by create and duplicate so IDs never silently overwrite.
 */
export function uniqueProjectExtensionGroupId(
	seed: string,
	taken: Iterable<string>,
): string {
	const existing = new Set(taken);
	const base = sanitizeProjectExtensionGroupId(seed) || "group";
	if (!existing.has(base)) return base;
	let counter = 2;
	while (existing.has(`${base}-${counter}`)) counter += 1;
	return `${base}-${counter}`;
}

function diagnostic(
	code: ProjectExtensionGroupDiagnosticCode,
	severity: ProjectExtensionGroupDiagnosticSeverity,
	message: string,
	extra: {
		readonly groupId?: string;
		readonly extensionId?: string;
		readonly dependencyId?: string;
		readonly path?: readonly string[];
	} = {},
): ProjectExtensionGroupDiagnostic {
	return {
		code,
		severity,
		message,
		...(extra.groupId === undefined ? {} : { groupId: extra.groupId }),
		...(extra.extensionId === undefined
			? {}
			: { extensionId: extra.extensionId }),
		...(extra.dependencyId === undefined
			? {}
			: { dependencyId: extra.dependencyId }),
		...(extra.path === undefined ? {} : { path: extra.path }),
	};
}

/**
 * Resolves an activation group into its dependency closure plus a deterministic
 * dependency-first activation order.
 *
 * Results are stable for a given input regardless of declaration order: direct
 * members and dependency edges are visited in sorted order, so every caller
 * computing the same group agrees on the activation sequence.
 */
export function resolveProjectExtensionGroup(
	input: ResolveProjectExtensionGroupInput,
): ProjectExtensionGroupResolution {
	const diagnostics: ProjectExtensionGroupDiagnostic[] = [];
	const declared = new Map(
		input.extensions.map((extension) => [extension.id, extension]),
	);
	const groups = input.groups ?? {};
	const group = input.groupId === undefined ? undefined : groups[input.groupId];
	if (input.groupId !== undefined && !group)
		diagnostics.push(
			diagnostic(
				PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownGroup,
				"error",
				`Extension activation group '${input.groupId}' does not exist`,
				{ groupId: input.groupId },
			),
		);

	// No group and no staged membership means "activate everything declared",
	// which is the behaviour of a project that has not defined groups yet.
	const rawMembership = [
		...(input.directExtensionIds ??
			group?.extensionIds ??
			(input.groupId === undefined
				? input.extensions.map((extension) => extension.id)
				: [])),
	];
	const direct = normalizeExtensionMembership(rawMembership);
	const duplicates = [
		...new Set(
			rawMembership.filter(
				(id, index) =>
					id.trim().length > 0 && rawMembership.indexOf(id) !== index,
			),
		),
	].sort(byId);
	for (const duplicateId of duplicates)
		diagnostics.push(
			diagnostic(
				PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.duplicateMember,
				"warning",
				`Extension '${duplicateId}' is listed more than once`,
				{ groupId: input.groupId, extensionId: duplicateId },
			),
		);

	const knownDirect: string[] = [];
	const unknownExtensionIds: string[] = [];
	for (const id of direct) {
		if (declared.has(id)) {
			knownDirect.push(id);
			continue;
		}
		unknownExtensionIds.push(id);
		diagnostics.push(
			diagnostic(
				PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownExtension,
				"error",
				`Extension '${id}' is not declared by the project`,
				{ groupId: input.groupId, extensionId: id },
			),
		);
	}

	const order: string[] = [];
	const settled = new Set<string>();
	const visiting = new Set<string>();
	const reportedCycles = new Set<string>();
	const unavailableExtensionIds: string[] = [];

	const visit = (id: string, trail: readonly string[]): void => {
		if (settled.has(id)) return;
		if (visiting.has(id)) {
			const path = [...trail.slice(trail.indexOf(id)), id];
			const key = path.join(">");
			if (!reportedCycles.has(key)) {
				reportedCycles.add(key);
				diagnostics.push(
					diagnostic(
						PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.dependencyCycle,
						"error",
						`Extension dependency cycle: ${path.join(" -> ")}`,
						{ groupId: input.groupId, extensionId: id, path },
					),
				);
			}
			return;
		}
		const extension = declared.get(id);
		if (!extension) return;
		visiting.add(id);
		for (const dependencyId of [...(extension.requires ?? [])].sort(byId)) {
			if (!declared.has(dependencyId)) {
				diagnostics.push(
					diagnostic(
						PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.missingDependency,
						"error",
						`Extension '${id}' requires '${dependencyId}', which the project does not declare`,
						{ groupId: input.groupId, extensionId: id, dependencyId },
					),
				);
				continue;
			}
			visit(dependencyId, [...trail, id]);
		}
		visiting.delete(id);
		settled.add(id);
		order.push(id);
		const availability = extension.availability ?? "available";
		if (availability === "missing") {
			unavailableExtensionIds.push(id);
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unavailableExtension,
					"error",
					`Extension '${id}' is not available`,
					{ groupId: input.groupId, extensionId: id },
				),
			);
		}
		if (availability === "incompatible") {
			unavailableExtensionIds.push(id);
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.incompatibleExtension,
					"error",
					`Extension '${id}' is incompatible with this project`,
					{ groupId: input.groupId, extensionId: id },
				),
			);
		}
	};

	for (const id of knownDirect) visit(id, []);

	const directSet = new Set(knownDirect);
	const resolvedSet = new Set(order);
	const memberships: ProjectExtensionGroupMembership[] = order.map((id) => {
		const requiredBy = input.extensions
			.filter(
				(extension) =>
					resolvedSet.has(extension.id) &&
					(extension.requires ?? []).includes(id),
			)
			.map((extension) => extension.id)
			.sort(byId);
		return {
			extensionId: id,
			kind: directSet.has(id) ? "direct" : "automatic",
			requiredBy,
			availability: declared.get(id)?.availability ?? "available",
		};
	});
	if (group && direct.length === 0)
		diagnostics.push(
			diagnostic(
				PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.emptyGroup,
				"info",
				`Extension activation group '${group.id}' has no members`,
				{ groupId: group.id },
			),
		);

	return {
		...(input.groupId === undefined ? {} : { groupId: input.groupId }),
		directExtensionIds: direct,
		resolvedExtensionIds: [...order],
		automaticallyIncludedExtensionIds: order.filter((id) => !directSet.has(id)),
		excludedExtensionIds: input.extensions
			.map((extension) => extension.id)
			.filter((id) => !resolvedSet.has(id))
			.sort(byId),
		unknownExtensionIds,
		unavailableExtensionIds: [...new Set(unavailableExtensionIds)].sort(byId),
		activationOrder: [...order],
		memberships,
		diagnostics,
		valid: !diagnostics.some((item) => item.severity === "error"),
	};
}

/** Compares the current and proposed activation orders. */
export function computeProjectExtensionGroupImpact(
	current: readonly string[],
	proposed: readonly string[],
): ProjectExtensionGroupImpact {
	const currentSet = new Set(current);
	const proposedSet = new Set(proposed);
	const activated = proposed.filter((id) => !currentSet.has(id));
	const deactivated = current.filter((id) => !proposedSet.has(id));
	const unchanged = proposed.filter((id) => currentSet.has(id));
	const orderChanged =
		current.length !== proposed.length ||
		current.some((id, index) => proposed[index] !== id);
	return {
		requiresReload:
			activated.length > 0 || deactivated.length > 0 || orderChanged,
		activatedExtensionIds: activated,
		deactivatedExtensionIds: deactivated,
		unchangedExtensionIds: unchanged,
	};
}

/**
 * Validates a whole group map before persistence and returns structured
 * diagnostics with stable codes, so callers can present them per group, per
 * extension, or as a single rejection message.
 */
export function validateProjectExtensionGroups(
	input: ValidateProjectExtensionGroupsInput,
): readonly ProjectExtensionGroupDiagnostic[] {
	const diagnostics: ProjectExtensionGroupDiagnostic[] = [];
	const groups = input.groups ?? {};
	const reserved = new Set(input.reservedGroupIds ?? []);
	const seenIds = new Set<string>();
	for (const [key, group] of Object.entries(groups)) {
		if (!group || typeof group !== "object") {
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.groupIdMismatch,
					"error",
					`Extension activation group '${key}' is malformed`,
					{ groupId: key },
				),
			);
			continue;
		}
		if (group.id !== key)
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.groupIdMismatch,
					"error",
					`Extension activation group key '${key}' does not match its id '${group.id}'`,
					{ groupId: key },
				),
			);
		if (!isValidProjectExtensionGroupId(group.id))
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.invalidGroupId,
					"error",
					`Extension activation group id '${group.id}' is not a valid identifier`,
					{ groupId: group.id },
				),
			);
		if (seenIds.has(group.id))
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.duplicateGroupId,
					"error",
					`Extension activation group id '${group.id}' is declared more than once`,
					{ groupId: group.id },
				),
			);
		seenIds.add(group.id);
		if (!group.displayName || !group.displayName.trim())
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.emptyDisplayName,
					"error",
					`Extension activation group '${group.id}' requires a display name`,
					{ groupId: group.id },
				),
			);
		if (!PROJECT_EXTENSION_GROUP_SOURCES.includes(group.source))
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.invalidSource,
					"error",
					`Extension activation group '${group.id}' has an unknown source`,
					{ groupId: group.id },
				),
			);
		if (group.source === "project" && reserved.has(group.id))
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.reservedGroupId,
					"error",
					`Extension activation group id '${group.id}' is reserved by a contributed group`,
					{ groupId: group.id },
				),
			);
		if (!Array.isArray(group.extensionIds)) {
			diagnostics.push(
				diagnostic(
					PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.invalidMembership,
					"error",
					`Extension activation group '${group.id}' has an invalid membership list`,
					{ groupId: group.id },
				),
			);
			continue;
		}
		diagnostics.push(
			...resolveProjectExtensionGroup({
				groupId: group.id,
				groups,
				extensions: input.extensions,
			}).diagnostics.filter((item) => item.severity !== "info"),
		);
	}
	if (
		input.activeGroupId !== undefined &&
		!Object.hasOwn(groups, input.activeGroupId)
	)
		diagnostics.push(
			diagnostic(
				PROJECT_EXTENSION_GROUP_DIAGNOSTIC_CODES.unknownActiveGroup,
				"error",
				`Active extension activation group '${input.activeGroupId}' does not exist`,
				{ groupId: input.activeGroupId },
			),
		);
	return diagnostics;
}

/** True when a group may not be edited or deleted by the project. */
export function isReadOnlyProjectExtensionGroup(
	group: ProjectExtensionActivationGroup | undefined,
): boolean {
	if (!group) return false;
	return group.readOnly === true || group.source !== "project";
}
