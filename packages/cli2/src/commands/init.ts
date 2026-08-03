import type { ClinicalRuntime } from "@stateful-mcp/clinical/store/clinical-runtime";
import { printJson } from "../formatter/format-parsed";

export async function handleInit(runtime: ClinicalRuntime): Promise<void> {
	const stores = runtime.parserStores;
	const profiles = await stores.profiles.list();
	const profileIds = profiles.map((p) => p.profileId);

	printJson({
		readiness: "bootstrap-ready",
		profiles: profileIds,
		storeCount: Object.keys(stores).length,
	});
}
