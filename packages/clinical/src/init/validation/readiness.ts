import type { ClinicalRuntimeParserStores } from "../../store/clinical-runtime";

export type BootstrapReadiness =
	| "not-checked"
	| "bootstrap-ready"
	| "full-ready"
	| "degraded";

export async function validateBootstrapReadiness(
	stores: ClinicalRuntimeParserStores,
): Promise<BootstrapReadiness> {
	const profiles = await stores.profiles.list();
	if (profiles.length === 0) return "degraded";

	const activeProfile = profiles[0]!;

	const attributeBindings = await stores.attributeBindings.listBindings(
		activeProfile.profileId,
	);
	if (attributeBindings.length === 0) return "degraded";

	const evaluatorBindings = await stores.evaluatorBindings.listBindings(
		activeProfile.profileId,
	);
	if (evaluatorBindings.length === 0) return "degraded";

	const profileTags = await stores.profileTags.getProfileTags(
		activeProfile.profileId,
	);
	if (profileTags.length === 0) return "degraded";

	const conceptDefaults = await stores.conceptDefaults.list();
	if (conceptDefaults.length === 0) return "degraded";

	const sharedAnchors = await stores.sharedFieldAnchors.listForContext({});
	const hasProseTemplates = (await stores.proseTemplates.list()).length > 0;
	const hasProseParserTemplates =
		(await stores.proseParserTemplates.listAll()).length > 0;
	const hasConceptFields = (await stores.conceptFields.list()).length > 0;

	if (
		!hasProseTemplates ||
		!hasProseParserTemplates ||
		!hasConceptFields ||
		sharedAnchors.length === 0
	) {
		return "degraded";
	}

	return "bootstrap-ready";
}
