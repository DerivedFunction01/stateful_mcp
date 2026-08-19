export type SettingsScope = "user" | "workspace" | "folder";

export interface SettingsSchemaEntryDto {
	readonly path: readonly string[];
	readonly type:
		| "boolean"
		| "number"
		| "string"
		| "enum"
		| "array"
		| "object"
		| "json"
		| "keymap";
	readonly title: string;
	readonly description?: string;
	readonly widget?: string;
	readonly category?: string;
	readonly group?: string;
	readonly order?: number;
	readonly placeholder?: string;
	readonly enumValues?: readonly string[];
	readonly enumOptions?: readonly {
		readonly id: string;
		readonly label: string;
		readonly description?: string;
		readonly meta?: string;
	}[];
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	readonly tagDelimiters?: readonly string[];
	readonly customWidgetId?: string;
	readonly restartRequired?: boolean;
	readonly sensitive?: boolean;
}

export interface SettingsDiagnosticDto {
	readonly severity: "error" | "warning";
	readonly path?: readonly string[];
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly restartRequired?: boolean;
}

export interface SettingsSnapshotDto {
	readonly effective: Readonly<Record<string, unknown>>;
	readonly draft: Readonly<Record<string, unknown>>;
	readonly rawText: string;
	readonly schema: readonly SettingsSchemaEntryDto[];
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly dirty: boolean;
	readonly activeProfileId: string;
}

export interface SettingsOriginDto {
	readonly kind: "default" | "inherited" | "appended" | "overridden";
	readonly sourceProfileId?: string;
	readonly appendedCount?: number;
	readonly description: string;
}

export interface SettingsUiItemDto {
	readonly path: readonly string[];
	readonly schema: SettingsSchemaEntryDto;
	readonly value: unknown;
	readonly effectiveValue: unknown;
	readonly isModified: boolean;
	readonly origin: SettingsOriginDto;
	readonly diagnostics: readonly SettingsDiagnosticDto[];
}

export interface SettingsUiGroupDto {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly order?: number;
	readonly items: readonly SettingsUiItemDto[];
}

export interface SettingsUiSectionDto {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly icon?: string;
	readonly description?: string;
	readonly order?: number;
	readonly items: readonly SettingsUiItemDto[];
	readonly groups: readonly SettingsUiGroupDto[];
}

export interface SettingsUiSnapshotDto {
	readonly activeProfileId: string;
	readonly availableProfiles: readonly string[];
	readonly activeScope: SettingsScope;
	readonly supportedScopes: readonly SettingsScope[];
	readonly unsupportedScopeReason?: string;
	readonly searchQuery: string;
	readonly filterModifiedOnly: boolean;
	readonly isSplitJsonMode: boolean;
	readonly jsonModeAvailable: boolean;
	readonly modifiedCount: number;
	readonly totalModifiedCount: number;
	readonly sections: readonly SettingsUiSectionDto[];
	readonly rawJsonText: string;
	readonly hasErrors: boolean;
	readonly settingsRevision: string;
}

export type SettingsOperation =
	| {
			readonly operation: "set";
			readonly path: readonly string[];
			readonly value: unknown;
			readonly expectedRevision?: string;
	  }
	| {
			readonly operation: "replaceJson";
			readonly rawText: string;
			readonly expectedRevision?: string;
	  }
	| { readonly operation: "save"; readonly expectedRevision?: string }
	| { readonly operation: "discard"; readonly expectedRevision?: string }
	| { readonly operation: "reload"; readonly expectedRevision?: string }
	| {
			readonly operation: "profile.select";
			readonly profileId: string;
			readonly expectedRevision?: string;
	  }
	| {
			readonly operation: "scope.select";
			readonly scope: SettingsScope;
			readonly expectedRevision?: string;
	  }
	| {
			readonly operation: "jsonMode.toggle";
			readonly enabled: boolean;
			readonly expectedRevision?: string;
	  };

export type SettingsUiOperation =
	| {
			readonly operation: "settings.ui.scope.set";
			readonly scope: SettingsScope;
	  }
	| {
			readonly operation: "settings.ui.search.set";
			readonly query: string;
	  }
	| {
			readonly operation: "settings.ui.modifiedOnly.set";
			readonly enabled: boolean;
	  }
	| {
			readonly operation: "settings.ui.jsonMode.toggle";
	  }
	| {
			readonly operation: "settings.ui.section.set";
			readonly sectionId: string;
	  };

export interface SettingsConflictResult {
	readonly status: "conflict";
	readonly code: "SETTINGS_REVISION_STALE";
	readonly message: string;
	readonly expectedRevision: string;
	readonly actualRevision: string;
	readonly snapshot: SettingsUiSnapshotDto;
}

export interface SettingsBlockedResult {
	readonly status: "blocked";
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly snapshot: SettingsUiSnapshotDto;
}

export interface SettingsUnsupportedResult {
	readonly status: "unsupported";
	readonly code: string;
	readonly message: string;
	readonly snapshot: SettingsUiSnapshotDto;
}

export interface SettingsSavedResult {
	readonly status: "saved";
	readonly restartRequired: boolean;
	readonly settingsRevision: string;
	readonly snapshot: SettingsUiSnapshotDto;
}

export type SettingsApplyResult =
	| SettingsSavedResult
	| SettingsBlockedResult
	| SettingsConflictResult
	| SettingsUnsupportedResult;
