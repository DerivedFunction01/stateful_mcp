import type { CommandDescriptorDto } from "./commands";
import type { SettingsUiSnapshotDto } from "./settings";

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

export interface EffectiveKeymapDto {
	readonly profileId: string;
	readonly name: string;
	readonly description?: string;
	readonly bindings: readonly KeymapBindingDto[];
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
		readonly title: string;
		readonly icon: string;
		readonly order?: number;
		readonly region?: "activity" | "inspector";
		readonly extensionId?: string;
	}[];
}

export interface LayoutRegionDto {
	readonly open: boolean;
	readonly dock: "start" | "end";
	readonly widthRatio: number;
}

export interface LayoutSnapshotDto {
	readonly activeTabId: string;
	readonly sidepanelOpen: boolean;
	readonly sidepanelPosition: "left" | "right";
	readonly sidepanelWidthRatio: number;
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
	readonly lifecycle: "open" | "dirty" | "closed";
	readonly revision: string;
	readonly resources: readonly ProjectResourceReferenceDto[];
	readonly historyResources: readonly ProjectResourceReferenceDto[];
}

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
	readonly scratchpad: Readonly<Record<string, unknown>>;
	readonly diagnostics: readonly DiagnosticDto[];
	readonly project?: ProjectDescriptorDto;
	readonly revision: number;
}
