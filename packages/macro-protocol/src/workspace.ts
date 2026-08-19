import type { CommandDescriptorDto } from "./commands";
import type { SettingsSnapshotDto } from "./settings";

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

export interface KeymapBindingDto {
	readonly command: string;
	readonly chords: readonly string[];
	readonly modes?: readonly string[];
	readonly when?: unknown;
	readonly labelI18nKey?: string;
}

export interface EffectiveKeymapDto {
	readonly profileId: string;
	readonly name: string;
	readonly description?: string;
	readonly bindings: readonly KeymapBindingDto[];
}

export interface ContributionSnapshotDto {
	readonly tabs: readonly { readonly id: string; readonly label: string; readonly icon?: string; readonly extensionId?: string }[];
	readonly views: readonly { readonly id: string; readonly name: string; readonly containerId: string; readonly extensionId?: string }[];
	readonly containers: readonly { readonly id: string; readonly title: string; readonly icon: string; readonly extensionId?: string }[];
}

export interface DiagnosticDto {
	readonly severity: "info" | "warning" | "error";
	readonly message: string;
	readonly code?: string;
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
	readonly settings: SettingsSnapshotDto;
	readonly layout: Readonly<Record<string, unknown>>;
	readonly activeTabId?: string;
	readonly scratchpad: Readonly<Record<string, unknown>>;
	readonly diagnostics: readonly DiagnosticDto[];
	readonly revision: number;
}
