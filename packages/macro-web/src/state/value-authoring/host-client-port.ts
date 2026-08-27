import type { WizardAuthoringPort } from "@stateful-mcp/macro/workspace/config/wizard";
import type { HostClient } from "../../lib/host-client";

/**
 * Adapts the typed browser HostClient into the renderer-neutral wizard port.
 * One-directional and total: the wizard never sees the HostClient itself.
 */
export function createHostClientAuthoringPort(
	client: HostClient,
): WizardAuthoringPort {
	return {
		load: (profileId) => client.valueAuthoringLoad(profileId),
		validate: (profile) => client.valueAuthoringValidate(profile),
		preview: (profile, options) =>
			client.valueAuthoringPreview(profile, {
				samples: options?.samples,
				request: options?.request,
				expectedRevision: options?.expectedRevision,
			}),
		save: (profile, expectedRevision) =>
			client.valueAuthoringSave(profile, expectedRevision),
	};
}
