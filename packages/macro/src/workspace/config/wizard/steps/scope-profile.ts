import type {
	SettingsScope,
	ValueAuthoringProfileDto,
} from "@stateful-mcp/macro-protocol";
import type { ValueAuthoringWizardState } from "../state";

/** Display projection for the scope/profile selection step. */
export interface ScopeProfileView {
	readonly editedProfileId: string | null;
	readonly editedLabel: string | null;
	readonly activeProfileId: string | null;
	/** Parent display; `missing` marks a broken extends chain surfacing. */
	readonly parent: {
		readonly extendsId: string | null;
		readonly missing: boolean;
	};
	/** Editing an inherited/base profile migrates into local-edit mode. */
	readonly localEditMode: boolean;
	readonly scopeAvailability: readonly {
		readonly scope: SettingsScope;
		readonly supported: boolean;
		readonly reasonKey: string | null;
	}[];
	readonly availableProfiles: readonly {
		readonly id: string;
		readonly label?: string;
		readonly extends?: string;
	}[];
}

export function projectScopeProfileStep(
	state: ValueAuthoringWizardState,
): ScopeProfileView {
	return {
		editedProfileId: state.editedProfileId,
		editedLabel: state.editedLabel,
		activeProfileId: state.activeProfileId,
		parent: {
			extendsId: state.editedExtendsId,
			missing: state.parentMissing,
		},
		localEditMode: state.editedProfileId !== null,
		scopeAvailability: state.scopeAvailability,
		availableProfiles: state.availableProfiles,
	};
}

export interface NewLocalProfileInput {
	readonly id: string;
	readonly label?: string;
	readonly extends?: string;
	readonly locale?: string;
}

/**
 * Builds a minimal new-local draft migrated from an optional base profile.
 * Collections stay empty arrays; inheritance stays declared explicitly.
 */
export function buildNewLocalProfile(
	input: NewLocalProfileInput,
): ValueAuthoringProfileDto {
	const profile: Record<string, unknown> = {
		id: input.id,
		aliases: [],
		fundamentals: [],
		recipes: [],
	};
	if (input.label !== undefined) profile.label = input.label;
	if (input.extends !== undefined) profile.extends = input.extends;
	if (input.locale !== undefined) profile.locale = input.locale;
	return profile as unknown as ValueAuthoringProfileDto;
}
