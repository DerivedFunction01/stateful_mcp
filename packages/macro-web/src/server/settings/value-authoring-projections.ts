import type {
	ValueAuthoringDraft,
	ValueAuthoringProfile,
	ValueAuthoringValidation,
} from "@stateful-mcp/macro";
import { serializeValueAuthoringProfile } from "@stateful-mcp/macro";
import type {
	ValueAuthoringDraftDto,
	ValueAuthoringProfileDto,
	ValueAuthoringValidationDto,
} from "@stateful-mcp/macro-protocol";
import { toSettingsDiagnosticDto } from "./settings-projections";

export function toValueAuthoringProfileDto(
	profile: ValueAuthoringProfile,
): ValueAuthoringProfileDto {
	return serializeValueAuthoringProfile(
		profile,
	) as unknown as ValueAuthoringProfileDto;
}

export function toValueAuthoringDraftDto(
	draft: ValueAuthoringDraft,
): ValueAuthoringDraftDto {
	return {
		profile: toValueAuthoringProfileDto(draft.profile),
		activeDomain: draft.activeDomain,
		selectedGroupId: draft.selectedGroupId,
		selectedRecipeId: draft.selectedRecipeId,
		revision: draft.revision,
		dirty: draft.dirty,
		diagnostics: draft.diagnostics.map(toSettingsDiagnosticDto),
		compileStatus: draft.compileStatus,
		graphFingerprint: draft.graphFingerprint,
	};
}

export function toValueAuthoringValidationDto(
	validation: ValueAuthoringValidation,
): ValueAuthoringValidationDto {
	return {
		valid: validation.valid,
		diagnostics: validation.diagnostics.map(toSettingsDiagnosticDto),
		graphFingerprint: validation.graphFingerprint,
	};
}
