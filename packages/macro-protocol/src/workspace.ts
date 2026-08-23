import type { CommandDescriptorDto } from "./commands";
import type { EditorWorkspaceSnapshotDto } from "./editor";
import type { SettingsUiSnapshotDto } from "./settings";

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
	readonly pinnedMacros?: readonly string[];
}

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
	readonly message: string;
	readonly code?: string;
	readonly messageKey?: string;
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

export interface ProjectDescriptorDto {
	readonly projectId: string;
	readonly displayName: string;
	readonly displayNameI18nKey?: string;
	readonly lifecycle: "open" | "dirty" | "closed";
	readonly revision: string;
	readonly resources: readonly ProjectResourceReferenceDto[];
	readonly historyResources: readonly ProjectResourceReferenceDto[];
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
