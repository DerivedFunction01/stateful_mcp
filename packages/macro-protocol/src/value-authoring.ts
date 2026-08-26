import type { JsonValue, MessageParam } from "./errors";
import type { SettingsDiagnosticDto, SettingsScope } from "./settings";

/** JSON-safe transport shape; grammar contracts remain owned by macro. */
export type ValueAuthoringProfileDto = Readonly<Record<string, JsonValue>>;

export interface ValueAuthoringDraftDto {
	readonly profile: ValueAuthoringProfileDto;
	readonly activeDomain?: string;
	readonly selectedGroupId?: string;
	readonly selectedRecipeId?: string;
	readonly revision: string;
	readonly dirty: boolean;
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly compileStatus: "valid" | "invalid" | "empty";
	readonly graphFingerprint: string;
}

export interface ValueAuthoringValidationDto {
	readonly valid: boolean;
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly graphFingerprint: string;
}

export type ValueAuthoringOperation =
	| {
			readonly operation: "valueAuthoring.load";
			readonly profileId: string;
			readonly scope?: SettingsScope;
	  }
	| {
			readonly operation: "valueAuthoring.validate";
			readonly profile: ValueAuthoringProfileDto;
	  }
	| {
			readonly operation: "valueAuthoring.preview";
			readonly profile: ValueAuthoringProfileDto;
			readonly activeDomain?: string;
			readonly selectedGroupId?: string;
			readonly selectedRecipeId?: string;
			readonly expectedRevision?: string;
	  }
	| {
			readonly operation: "valueAuthoring.save";
			readonly profile: ValueAuthoringProfileDto;
			readonly expectedRevision: string;
	  };

export type ValueAuthoringResult =
	| {
			readonly status: "loaded" | "previewed";
			readonly draft: ValueAuthoringDraftDto;
			readonly settingsRevision: string;
	  }
	| {
			readonly status: "validated";
			readonly validation: ValueAuthoringValidationDto;
	  }
	| {
			readonly status: "saved";
			readonly settingsRevision: string;
			readonly draft: ValueAuthoringDraftDto;
	  }
	| {
			readonly status: "blocked";
			readonly diagnostics: readonly SettingsDiagnosticDto[];
			readonly validation: ValueAuthoringValidationDto;
	  }
	| {
			readonly status: "conflict";
			readonly code: "SETTINGS_REVISION_STALE";
			readonly messageKey: string;
			readonly messageParams?: Readonly<Record<string, MessageParam>>;
			readonly expectedRevision: string;
			readonly actualRevision: string;
	  };
