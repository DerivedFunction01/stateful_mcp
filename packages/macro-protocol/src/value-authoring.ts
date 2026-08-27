import type { JsonValue, MessageParam } from "./errors";
import type { SettingsDiagnosticDto, SettingsScope } from "./settings";

/**
 * Typed JSON-safe alias definition; mirrors the persisted macro contract
 * without importing it (parity is enforced by tests).
 */
export interface ValueAliasDefinitionDto {
	readonly id: string;
	readonly namespace: string;
	readonly spellings: readonly string[];
	readonly lexiconId?: string;
	readonly locale?: string;
	readonly caseSensitive?: boolean;
	readonly target: {
		readonly kind: "canonical" | "literal" | "resolver";
		readonly value?: unknown;
		readonly resolverId?: string;
		readonly params?: Record<string, JsonValue>;
	};
}

/** Typed fundamental variant pattern; literal or regex-authored. */
export interface ValuePatternDto {
	readonly id: string;
	readonly text: string;
	readonly isRegex?: boolean;
	readonly caseSensitive?: boolean;
	readonly boundary?: "none" | "unicode";
}

export interface ValueSlotDto {
	readonly id: string;
	readonly parserId?: string;
	readonly pattern?: string;
}

export interface ValueFundamentalVariantDto {
	readonly id: string;
	readonly slots: readonly ValueSlotDto[];
	readonly prefix?: readonly (readonly ValuePatternDto[])[];
	readonly connectors?: readonly (readonly ValuePatternDto[])[];
	readonly postfix?: readonly ValuePatternDto[];
	readonly priority?: number;
}

export interface ValueFundamentalGroupDto {
	readonly id: string;
	readonly variants: readonly ValueFundamentalVariantDto[];
}

export type RecipeNodeDto =
	| { readonly kind: "terminal"; readonly consumerId: string }
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantIds?: readonly string[];
			readonly children?: readonly RecipeNodeDto[];
	  }
	| {
			readonly kind: "recipe";
			readonly recipeId: string;
			readonly children?: readonly RecipeNodeDto[];
	  };

export interface RecipeCapabilityDto {
	readonly valueKind?: string;
	readonly providedFields?: readonly string[];
	readonly requiredContext?: readonly string[];
}

export interface ValueRecipeDto {
	readonly id: string;
	readonly root: RecipeNodeDto;
	readonly outputBuilderId?: string;
	readonly priority?: number;
	readonly enabled?: boolean;
	readonly capability?: RecipeCapabilityDto;
}

export interface ValueAuthoringProfileDto {
	readonly id: string;
	readonly extends?: string;
	readonly label?: string;
	readonly locale?: string;
	readonly syntax?: Record<string, JsonValue>;
	readonly localization?: Record<string, JsonValue>;
	readonly numberWords?: Record<string, JsonValue>;
	readonly excludePrefixes?: readonly string[];
	readonly unitAliases?: Readonly<Record<string, readonly string[]>>;
	readonly operatorAliases?: Readonly<Record<string, readonly string[]>>;
	readonly statisticalAliases?: Readonly<Record<string, readonly string[]>>;
	readonly aliases?: readonly ValueAliasDefinitionDto[];
	readonly fundamentals?: readonly ValueFundamentalGroupDto[];
	readonly recipes?: readonly ValueRecipeDto[];
	readonly removedIds?: Readonly<Record<string, readonly string[]>>;
	/** Domain grammar payloads are opaque at transport level; macro validates. */
	readonly values?: Readonly<Record<string, JsonValue>>;
	readonly argumentPolicies?: Readonly<Record<string, JsonValue>>;
}

export function parseValueAuthoringProfileDto(
	value: unknown,
):
	| { ok: true; profile: ValueAuthoringProfileDto }
	| { ok: false; errors: readonly SettingsDiagnosticDto[] } {
	const errors: SettingsDiagnosticDto[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			errors: [
				{
					severity: "error",
					code: "PROFILE_MALFORMED",
					messageKey: "request.payload.malformed",
				},
			],
		};
	}
	if (typeof value.id !== "string") {
		errors.push({
			severity: "error",
			code: "PROFILE_ID_MISSING",
			messageKey: "request.payload.malformed",
			path: ["id"],
		});
	}
	const forbidden = ["aliasResolvers"] as const;
	for (const key of forbidden) {
		if (key in value) {
			errors.push({
				severity: "error",
				code: "PROFILE_RUNTIME_FIELD",
				messageKey: "request.payload.malformed",
				path: [key],
			});
		}
	}
	for (const key of ["aliases", "fundamentals", "recipes"] as const) {
		const collection = value[key];
		if (collection !== undefined && !Array.isArray(collection)) {
			errors.push({
				severity: "error",
				code: "PROFILE_COLLECTION_INVALID",
				messageKey: "request.payload.malformed",
				path: [key],
			});
		}
	}
	if (value.removedIds !== undefined && !isRecord(value.removedIds)) {
		errors.push({
			severity: "error",
			code: "PROFILE_REMOVED_IDS_INVALID",
			messageKey: "request.payload.malformed",
			path: ["removedIds"],
		});
	}
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, profile: value as unknown as ValueAuthoringProfileDto };
}

export interface ValueSampleDto {
	readonly input: string;
	readonly argumentId?: string;
}

export interface ValueRequestDto {
	readonly valueKind: string;
	readonly requiredFields?: readonly string[];
	readonly allowAdditionalFields?: boolean;
}

export interface ValueCatalogRecipeEntryDto {
	readonly id: string;
	readonly valueKind?: string;
	readonly providedFields?: readonly string[];
}

export interface ValueCatalogDto {
	readonly valueKinds: readonly string[];
	readonly terminalIds: readonly string[];
	readonly recipes: readonly ValueCatalogRecipeEntryDto[];
	readonly providerIds?: readonly string[];
}

export interface ValueCandidateRejectionDto {
	readonly recipeId: string;
	readonly reason:
		| "capability_mismatch"
		| "invalid_value"
		| "disabled"
		| "not_enabled";
	readonly detailKey?: string;
}

export interface ValueSampleResultDto {
	readonly input: string;
	readonly argumentId?: string;
	readonly matched: boolean;
	readonly recipeId?: string;
	readonly canonicalValue?: JsonValue;
	readonly displayValue?: string;
	readonly captures?: Readonly<Record<string, string>>;
	readonly span?: { readonly start: number; readonly end: number };
	readonly rejected?: readonly ValueCandidateRejectionDto[];
	readonly diagnostics: readonly SettingsDiagnosticDto[];
}

export interface ValuePreviewDto {
	readonly graphFingerprint: string;
	readonly catalog?: ValueCatalogDto;
	readonly samples?: readonly ValueSampleResultDto[];
}

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
			readonly samples?: readonly ValueSampleDto[];
			readonly request?: ValueRequestDto;
	  }
	| {
			readonly operation: "valueAuthoring.save";
			readonly profile: ValueAuthoringProfileDto;
			readonly expectedRevision: string;
	  };

export type ValueAuthoringResult =
	| {
			readonly status: "loaded";
			readonly draft: ValueAuthoringDraftDto;
			readonly settingsRevision: string;
			readonly catalog?: ValueCatalogDto;
	  }
	| {
			readonly status: "previewed";
			readonly draft: ValueAuthoringDraftDto;
			readonly settingsRevision: string;
			readonly preview?: ValuePreviewDto;
	  }
	| {
			readonly status: "validated";
			readonly validation: ValueAuthoringValidationDto;
			readonly catalog?: ValueCatalogDto;
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
			readonly code: "SETTINGS_REVISION_STALE" | "REQUEST_PAYLOAD_MALFORMED";
			readonly messageKey: string;
			readonly messageParams?: Readonly<Record<string, MessageParam>>;
			readonly expectedRevision?: string;
			readonly actualRevision?: string;
			readonly errors?: readonly SettingsDiagnosticDto[];
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
