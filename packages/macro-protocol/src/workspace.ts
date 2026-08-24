import type { CommandDescriptorDto } from "./commands";
import type { EditorWorkspaceSnapshotDto } from "./editor";
import type { MessageParam } from "./errors";
import type { SettingsSchemaEntryDto, SettingsUiSnapshotDto } from "./settings";

export type GitFileStatus = "modified" | "untracked" | "staged" | "deleted";

export interface FileTreeItemDto {
	readonly name: string;
	readonly path: string;
	readonly isDirectory: boolean;
	readonly size?: number;
	readonly mtime?: number;
	readonly gitStatus?: GitFileStatus;
	readonly children?: readonly FileTreeItemDto[];
}

export const LAYOUT_RATIO_DEFAULTS: Readonly<{
	domainRail: number;
	activity: number;
	inspector: number;
}> = {
	domainRail: 0.2,
	activity: 0.2,
	inspector: 0.35,
};

export const LAYOUT_RATIO_BOUNDS: Readonly<{
	min: number;
	max: number;
}> = {
	min: 0.15,
	max: 0.65,
};

export interface ProfileDescriptor {
	readonly id: string;
	readonly displayName: string;
	readonly displayNameI18nKey?: string;
	readonly description?: string;
	readonly enabledExtensionIds: readonly string[];
}

export interface DomainApplicationDescriptor {
	readonly id: string;
	readonly displayName: string;
	readonly description?: string;
	readonly icon?: string;
	readonly extensionVersion?: string;
}

export type KeymapBindingSource =
	| "macro-profile"
	| "browser-baseline"
	| "user-override"
	| "extension";

export interface KeymapBindingDto {
	readonly command: string;
	readonly chords: readonly string[];
	readonly modes?: readonly string[];
	readonly when?: unknown;
	readonly labelI18nKey?: string;
	/**
	 * Precedence owner of the effective binding. Projected by the host from the
	 * resolved keymap layers; it does not change the canonical Macro profile.
	 */
	readonly source?: KeymapBindingSource;
	/** Canonical command superseded by this binding when layers overlap. */
	readonly replacedBinding?: string;
}

export interface KeymapVimSectionDto {
	readonly normal?: Readonly<Record<string, string>>;
	readonly visual?: Readonly<Record<string, string>>;
	readonly sequences?: Readonly<Record<string, string>>;
}

export interface KeymapWorkbenchSectionDto {
	readonly openCommandPalette?: string;
	readonly quickOpen?: string;
	readonly openSettings?: string;
	readonly toggleSidepanel?: string;
	readonly toggleDrawer?: string;
	readonly splitGroup?: string;
	readonly toggleActivityPanel?: string;
	readonly switchSplitFocus?: string;
	readonly nextTab?: string;
	readonly prevTab?: string;
	readonly pinMacro?: string;
}

export interface EffectiveKeymapDto {
	readonly profileId: string;
	readonly name: string;
	readonly description?: string;
	readonly vim?: KeymapVimSectionDto;
	readonly normal?: Readonly<Record<string, string>>;
	readonly visual?: Readonly<Record<string, string>>;
	readonly sequences?: Readonly<Record<string, string>>;
	readonly aliases?: Readonly<Record<string, string>>;
	readonly bindings: readonly KeymapBindingDto[];
}

export const PINNED_MACRO_SOURCES = [
	"extension",
	"project",
	"frequent",
] as const;

export type PinnedMacroSource = (typeof PINNED_MACRO_SOURCES)[number];

export interface PinnedMacroDto {
	readonly id: string;
	readonly macroName: string;
	readonly title?: string;
	readonly source: PinnedMacroSource;
	readonly executionCount?: number;
	readonly extensionId?: string;
	readonly snippet?: string;
}

export interface MacroCustomizationDto {
	readonly subOrder?: readonly string[];
	readonly subOrderGroups?: Readonly<Record<string, readonly string[]>>;
	readonly aliases?: readonly string[];
	readonly defaultValues?: Readonly<Record<string, unknown>>;
}

export interface MacroProjectManifestDto {
	readonly projectId?: string;
	readonly displayName?: string;
	readonly activeProfileId?: string;
	readonly enabledExtensions?: readonly string[];
	readonly macroAliases?: Readonly<Record<string, string>>;
	readonly macroCustomizations?: Readonly<
		Record<string, MacroCustomizationDto>
	>;
	readonly quickRuns?: readonly string[];
}

export interface ProjectConfigurationTemplateDto {
	readonly templateId: string;
	readonly title: string;
	readonly description?: string;
	readonly initialText?: string;
	/** Per-cell hidden defaults, keyed by 1-based line number. */
	readonly cellDefaults?: readonly {
		readonly lineNumber: number;
		readonly defaultMacroId: string;
	}[];
	readonly tags?: readonly string[];
}

export interface ProjectSettingsContributionDto {
	readonly extensionId: string;
	readonly namespace: string;
	readonly title: string;
	readonly description?: string;
	readonly schema: readonly SettingsSchemaEntryDto[];
}

export const PROJECT_EXTENSION_GROUP_SOURCES_DTO = [
	"project",
	"builtin",
	"extension",
] as const;

export type ProjectExtensionGroupSourceDto =
	(typeof PROJECT_EXTENSION_GROUP_SOURCES_DTO)[number];

/**
 * Wire projection of a project-local Extension Activation Group. Distinct from
 * Macro/language profiles: it selects which declared project extensions are
 * activated. `extensionIds` is direct membership only; dependency closure is
 * reported by the resolution DTO instead.
 */
export interface ProjectExtensionActivationGroupDto {
	readonly id: string;
	readonly displayName: string;
	readonly description?: string;
	readonly extensionIds: readonly string[];
	readonly source: ProjectExtensionGroupSourceDto;
	readonly readOnly?: boolean;
}

export type ProjectExtensionGroupDiagnosticSeverityDto =
	| "info"
	| "warning"
	| "error";

export interface ProjectExtensionGroupDiagnosticDto {
	readonly code: string;
	readonly severity: ProjectExtensionGroupDiagnosticSeverityDto;
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, import("./errors").MessageParam>>;
	readonly groupId?: string;
	readonly extensionId?: string;
	readonly dependencyId?: string;
	readonly path?: readonly string[];
}

export type ProjectExtensionAvailabilityDto =
	| "available"
	| "missing"
	| "incompatible";

export type ProjectExtensionMembershipKindDto = "direct" | "automatic";

export interface ProjectExtensionGroupMembershipDto {
	readonly extensionId: string;
	readonly kind: ProjectExtensionMembershipKindDto;
	readonly requiredBy: readonly string[];
	readonly availability: ProjectExtensionAvailabilityDto;
}

/** Host-resolved activation set for one group, produced by the canonical resolver. */
export interface ProjectExtensionGroupResolutionDto {
	readonly groupId?: string;
	readonly directExtensionIds: readonly string[];
	readonly resolvedExtensionIds: readonly string[];
	readonly automaticallyIncludedExtensionIds: readonly string[];
	readonly excludedExtensionIds: readonly string[];
	readonly unknownExtensionIds: readonly string[];
	readonly unavailableExtensionIds: readonly string[];
	readonly activationOrder: readonly string[];
	readonly memberships: readonly ProjectExtensionGroupMembershipDto[];
	readonly diagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
	readonly valid: boolean;
}

export interface ProjectExtensionGroupImpactDto {
	readonly requiresReload: boolean;
	readonly activatedExtensionIds: readonly string[];
	readonly deactivatedExtensionIds: readonly string[];
	readonly unchangedExtensionIds: readonly string[];
}

/**
 * Capability identity of one declared project extension, projected by the host
 * from active contributions and registered project metadata. The browser never
 * derives capabilities from raw manifests, so counts and capability lists in
 * the UI are always host-computed.
 */
export interface ProjectExtensionCapabilitiesDto {
	readonly macros: readonly string[];
	readonly commands: readonly string[];
	readonly views: readonly string[];
	readonly tabs: readonly string[];
	readonly settings: readonly string[];
	readonly projectSettings: readonly string[];
	readonly resources: readonly string[];
	readonly migrationParticipants: readonly string[];
}

/** Read-only host catalog entry for a declared project extension. */
export interface ProjectExtensionDescriptorDto {
	readonly id: string;
	readonly source: string;
	readonly version: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly requires: readonly string[];
	readonly availability: ProjectExtensionAvailabilityDto;
	readonly active: boolean;
	readonly capabilities: ProjectExtensionCapabilitiesDto;
	readonly diagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
}

export interface ProjectConfigurationDto {
	readonly formatVersion: number;
	readonly projectId: string;
	readonly displayName: string;
	readonly backend: {
		readonly kind: "jsonl" | "sqlite";
		readonly path: string;
	};
	readonly activeExtensionGroupId?: string;
	readonly uiLocale?: string;
	readonly extensions: readonly {
		readonly id: string;
		readonly source: string;
		readonly version: string;
		readonly requires?: readonly string[];
	}[];
	readonly extensionGroups?: Readonly<
		Record<string, ProjectExtensionActivationGroupDto>
	>;
	/**
	 * Host-provided read-only extension catalog. Always projected by the host so
	 * group editors can render capability summaries without inspecting manifests.
	 */
	readonly extensionCatalog?: readonly ProjectExtensionDescriptorDto[];
	/** Resolution of the currently active group, or of "activate everything". */
	readonly activeExtensionGroupResolution?: ProjectExtensionGroupResolutionDto;
	readonly resources: readonly ProjectResourceReferenceDto[];
	readonly historyResources: readonly ProjectResourceReferenceDto[];
	readonly scratchpadResources?: readonly ProjectResourceReferenceDto[];
	readonly templates?: readonly ProjectConfigurationTemplateDto[];
	readonly projectSettings?: Readonly<
		Record<string, Readonly<Record<string, unknown>>>
	>;
	readonly projectSettingsContributions: readonly ProjectSettingsContributionDto[];
	readonly revision: string;
	readonly availableLocales: readonly {
		readonly id: string;
		readonly source: "builtin" | "extension";
	}[];
}

/** Editable project metadata. Extension Activation Groups have their own API. */
export type ProjectConfigurationEditDto = Omit<
	ProjectConfigurationDto,
	"extensionGroups" | "activeExtensionGroupId"
>;

export type ProjectConfigurationImpact =
	| "metadata"
	| "templates"
	| "workspaceReload"
	| "backendMigrationRequired";

export interface ProjectMigrationParticipantDto {
	readonly id: string;
	readonly extensionId?: string;
	readonly dependsOn?: readonly string[];
	readonly status: "ready" | "missing" | "incompatible";
	readonly resourceIds: readonly string[];
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface ProjectBackendMigrationPlanDto {
	readonly source: ProjectConfigurationDto["backend"];
	readonly target: ProjectConfigurationDto["backend"];
	readonly participants: readonly ProjectMigrationParticipantDto[];
	readonly historyCount: number;
	readonly scratchpadCount: number;
	readonly warnings: readonly string[];
	readonly sourceDigest: string;
}

/**
 * Explicit migration journal states written while a backend migration is
 * applied. Every state except `finalizing` can be resumed by discarding the
 * partially written target and retrying, because the source backend is never
 * mutated by a migration.
 */
export type ProjectMigrationJournalStatus =
	| "preparing"
	| "copying"
	| "verifying"
	| "finalizing"
	| "failed";

export interface ProjectMigrationJournalOwnerDto {
	readonly pid: number;
	readonly hostname: string;
}

/**
 * Wire projection of a host migration journal. The journal is written
 * incrementally while a backend migration runs so an interrupted migration can
 * be recovered, discarded, or resumed without touching the source backend.
 */
export interface ProjectMigrationJournalDto {
	readonly journalVersion: number;
	readonly migrationId: string;
	readonly status: ProjectMigrationJournalStatus;
	readonly resumable: boolean;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly owner: ProjectMigrationJournalOwnerDto;
	readonly source: ProjectConfigurationDto["backend"];
	readonly target: ProjectConfigurationDto["backend"];
	readonly expectedRevision: string;
	readonly copiedHistory: number;
	readonly copiedScratchpads: number;
	readonly error?: string;
}

export type ProjectMigrationRecoveryAction =
	| "noJournal"
	| "invalidJournalCleared"
	| "migrationCompleted"
	| "targetDiscarded"
	| "targetRetained"
	| "activeMigrationRetained";

export interface ProjectMigrationRecoveryResultDto {
	readonly action: ProjectMigrationRecoveryAction;
	readonly journal: ProjectMigrationJournalDto | null;
	readonly stale?: boolean;
	readonly removedTargetPath?: string;
	readonly retainedReason?: string;
	readonly sourceDigestMatches?: boolean;
}

/**
 * A snapshot of the current migration journal state, derived from the host
 * journal plus a staleness check. `resumable` is true whenever the journal can
 * be either discarded (returning to the source backend) or resumed.
 */
export interface ProjectMigrationJournalStatusDto {
	readonly journal: ProjectMigrationJournalDto | null;
	readonly stale: boolean;
	readonly resumable: boolean;
}

export type ProjectOperation =
	| {
			readonly operation: "project.getConfiguration";
			readonly requestId: string;
	  }
	| {
			readonly operation: "project.updateConfiguration";
			readonly requestId: string;
			readonly configuration: ProjectConfigurationEditDto;
			readonly expectedRevision: string;
	  }
	| {
			readonly operation: "project.previewBackendMigration";
			readonly requestId: string;
			readonly source: ProjectConfigurationDto["backend"];
			readonly target: ProjectConfigurationDto["backend"];
	  }
	| {
			readonly operation: "project.applyBackendMigration";
			readonly requestId: string;
			readonly source: ProjectConfigurationDto["backend"];
			readonly target: ProjectConfigurationDto["backend"];
			readonly expectedRevision: string;
	  }
	| {
			readonly operation: "project.getMigrationJournal";
			readonly requestId: string;
	  }
	| {
			readonly operation: "project.recoverBackendMigration";
			readonly requestId: string;
	  }
	| {
			readonly operation: "project.discardBackendMigration";
			readonly requestId: string;
	  }
	| {
			readonly operation: "project.resumeBackendMigration";
			readonly requestId: string;
	  };

/**
 * Patch for one Extension Activation Group. Group editing never sends a whole
 * `ProjectConfigurationDto`: only the fields being changed are transmitted, and
 * the stable `groupId` is never rewritten by a display-name rename.
 */
export interface ProjectExtensionGroupPatch {
	readonly groupId: string;
	readonly displayName?: string;
	readonly description?: string;
	/** Direct membership only. Dependencies are resolved by the host. */
	readonly extensionIds?: readonly string[];
	readonly setActive?: boolean;
}

/** Fields accepted when creating or duplicating a project-owned group. */
export interface ProjectExtensionGroupDraft {
	/** Optional stable id. Sanitized and de-duplicated by the host when absent. */
	readonly groupId?: string;
	readonly displayName: string;
	readonly description?: string;
	readonly extensionIds?: readonly string[];
	readonly setActive?: boolean;
}

/**
 * Typed Extension Activation Group operations. Every mutating operation carries
 * `expectedRevision` for optimistic concurrency, and `apply` requests the
 * workspace reload ("Save and Apply") instead of only persisting the change.
 */
export type ProjectExtensionGroupOperation =
	| {
			readonly operation: "project.previewExtensionGroup";
			readonly requestId: string;
			readonly groupId?: string;
			/** Staged direct membership to preview without persisting it. */
			readonly extensionIds?: readonly string[];
			/** Preview the impact of also making this group active. */
			readonly setActive?: boolean;
	  }
	| {
			readonly operation: "project.updateExtensionGroup";
			readonly requestId: string;
			readonly patch: ProjectExtensionGroupPatch;
			readonly expectedRevision: string;
			readonly apply?: boolean;
	  }
	| {
			readonly operation: "project.createExtensionGroup";
			readonly requestId: string;
			readonly group: ProjectExtensionGroupDraft;
			readonly expectedRevision: string;
			readonly apply?: boolean;
	  }
	| {
			readonly operation: "project.duplicateExtensionGroup";
			readonly requestId: string;
			readonly sourceGroupId: string;
			readonly displayName?: string;
			readonly groupId?: string;
			readonly setActive?: boolean;
			readonly expectedRevision: string;
			readonly apply?: boolean;
	  }
	| {
			readonly operation: "project.deleteExtensionGroup";
			readonly requestId: string;
			readonly groupId: string;
			/** Group that becomes active when the active group is deleted. */
			readonly replacementGroupId?: string;
			/** Explicitly clear the active group instead of replacing it. */
			readonly clearActive?: boolean;
			readonly expectedRevision: string;
			readonly apply?: boolean;
	  }
	| {
			readonly operation: "project.setActiveExtensionGroup";
			readonly requestId: string;
			/** `null` clears the active group. */
			readonly groupId: string | null;
			readonly expectedRevision: string;
			readonly apply?: boolean;
	  };

export type ProjectExtensionGroupOperationName =
	ProjectExtensionGroupOperation["operation"];

export const PROJECT_EXTENSION_GROUP_OPERATIONS = [
	"project.previewExtensionGroup",
	"project.updateExtensionGroup",
	"project.createExtensionGroup",
	"project.duplicateExtensionGroup",
	"project.deleteExtensionGroup",
	"project.setActiveExtensionGroup",
] as const satisfies readonly ProjectExtensionGroupOperationName[];

/**
 * Discriminated result of an Extension Activation Group operation.
 *
 * `preview` never persists. `accepted` always reports the resolution and reload
 * impact of the persisted state, and carries a `snapshot` only when the
 * workspace was actually reloaded (`applied: true`). `conflict` returns the
 * latest configuration so the caller can reconcile instead of overwriting.
 */
export type ProjectExtensionGroupOperationResult =
	| {
			readonly status: "preview";
			readonly configuration: ProjectConfigurationDto;
			readonly groupId?: string;
			readonly group?: ProjectExtensionActivationGroupDto;
			readonly resolution: ProjectExtensionGroupResolutionDto;
			readonly impact: ProjectExtensionGroupImpactDto;
			readonly diagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
	  }
	| {
			readonly status: "accepted";
			readonly configuration: ProjectConfigurationDto;
			readonly groupId?: string;
			readonly group?: ProjectExtensionActivationGroupDto;
			readonly resolution: ProjectExtensionGroupResolutionDto;
			readonly impact: ProjectExtensionGroupImpactDto;
			readonly diagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
			/** True when the workspace was reloaded as part of this operation. */
			readonly applied: boolean;
			readonly snapshot?: WorkspaceSnapshot;
	  }
	| {
			readonly status: "conflict" | "rejected" | "unsupported";
			readonly messageKey: string;
			readonly messageParams?: Readonly<Record<string, MessageParam>>;
			readonly configuration?: ProjectConfigurationDto;
			readonly diagnostics?: readonly ProjectExtensionGroupDiagnosticDto[];
	  };

export type ProjectOperationResult =
	| {
			readonly status: "accepted";
			readonly configuration: ProjectConfigurationDto;
			readonly impact: ProjectConfigurationImpact;
			readonly snapshot: WorkspaceSnapshot;
	  }
	| {
			readonly status: "migrationRequired";
			readonly messageKey: string;
			readonly messageParams?: Readonly<Record<string, MessageParam>>;
			readonly configuration: ProjectConfigurationDto;
	  }
	| {
			readonly status: "plan";
			readonly configuration: ProjectConfigurationDto;
			readonly plan: ProjectBackendMigrationPlanDto;
	  }
	| {
			readonly status: "migrated";
			readonly configuration: ProjectConfigurationDto;
			readonly plan: ProjectBackendMigrationPlanDto;
			readonly snapshot: WorkspaceSnapshot;
	  }
	| {
			readonly status: "conflict" | "rejected" | "unsupported";
			readonly messageKey: string;
			readonly messageParams?: Readonly<Record<string, MessageParam>>;
			readonly configuration?: ProjectConfigurationDto;
			readonly diagnostics?: readonly ProjectExtensionGroupDiagnosticDto[];
	  };

export interface ContributionSnapshotDto {
	readonly tabs: readonly {
		readonly id: string;
		readonly label: string;
		readonly icon?: string;
		readonly order?: number;
		readonly defaultVisible?: boolean;
		readonly extensionId?: string;
	}[];
	readonly views: readonly {
		readonly id: string;
		readonly name: string;
		readonly containerId: string;
		readonly order?: number;
		readonly region?: "activity" | "inspector";
		readonly extensionId?: string;
	}[];
	readonly containers: readonly {
		readonly id: string;
		readonly titleI18nKey?: string;
		readonly icon?: string;
		readonly order?: number;
		readonly region?: "activity" | "inspector";
		readonly extensionId?: string;
	}[];
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly frequentMacros?: readonly PinnedMacroDto[];
}

export type SidepanelPosition = "left" | "right";
export type HorizontalAlignment = "left" | "right";

export interface LayoutRegionDto {
	readonly open: boolean;
	readonly dock: "start" | "end";
	readonly widthRatio: number;
}

export interface LayoutSnapshotDto {
	readonly activeTabId: string;
	readonly sidepanelOpen: boolean;
	readonly sidepanelPosition: SidepanelPosition;
	readonly sidepanelWidthRatio: number;
	readonly domainRailWidthRatio: number;
	readonly activeContainerId: string;
	readonly focusedPane: string;
	readonly activeModal: {
		readonly id: string;
		readonly title: string;
		readonly data?: unknown;
	} | null;
	readonly regions: Readonly<Record<string, LayoutRegionDto>>;
	readonly activeActivityContainerId: string;
	readonly activeInspectorContainerId: string;
	readonly inspectorMode: "follow" | "pinned";
	readonly pinnedInspectorViewId: string | null;
}

export interface DiagnosticDto {
	readonly severity: "info" | "warning" | "error";
	readonly code?: string;
	/** Structured i18n key; the only message carrier. No human-readable fallback. */
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, string | number | boolean>>;
	readonly span?: {
		readonly start: number;
		readonly end: number;
	};
}

export interface ProjectResourceReferenceDto {
	readonly resourceId: string;
	readonly kind: string;
	readonly revision?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ProjectResourceNodeCategory = "resource" | "external" | "link";
export type ProjectResourceStorageScope =
	| "project"
	| "global"
	| "content"
	| "cache"
	| "ephemeral"
	| "external";

export type ProjectResourceCapability =
	| "open"
	| "inspect"
	| "refresh"
	| "download"
	| "save"
	| "delete"
	| "invoke";

export interface ProjectResourceTreeNodeDto {
	readonly nodeId: string;
	readonly nodeType: "folder" | "resource";
	readonly label: string;
	readonly icon?: string;
	readonly category?: ProjectResourceNodeCategory;
	readonly scope?: ProjectResourceStorageScope;
	readonly resourceKind?: string;
	readonly resourceId?: string;
	readonly capabilities?: readonly ProjectResourceCapability[];
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly children?: readonly ProjectResourceTreeNodeDto[];
}

export interface ProjectDescriptorDto {
	readonly projectId: string;
	readonly displayName: string;
	readonly displayNameI18nKey?: string;
	readonly lifecycle: "open" | "dirty" | "closed";
	readonly revision: string;
	readonly resources: readonly ProjectResourceReferenceDto[];
	readonly historyResources: readonly ProjectResourceReferenceDto[];
	readonly resourceTree?: readonly ProjectResourceTreeNodeDto[];
	readonly ephemeral?: boolean;
}

export type { ScratchpadLineDto, ScratchpadSnapshotDto } from "./editor";

export interface WorkspaceSnapshot {
	readonly workspaceId: string;
	readonly sessionId: string;
	readonly profile: ProfileDescriptor;
	readonly enabledExtensionIds: readonly string[];
	readonly applications: readonly DomainApplicationDescriptor[];
	readonly keymap: EffectiveKeymapDto;
	readonly commands: readonly CommandDescriptorDto[];
	readonly contributions: ContributionSnapshotDto;
	readonly settings: SettingsUiSnapshotDto;
	readonly layout: LayoutSnapshotDto;
	readonly activeTabId?: string;
	readonly editor: EditorWorkspaceSnapshotDto;
	readonly diagnostics: readonly DiagnosticDto[];
	readonly project?: ProjectDescriptorDto;
	readonly revision: number;
}
