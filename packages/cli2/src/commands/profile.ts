import type { ClinicalRuntime } from "@stateful-mcp/clinical/store/clinical-runtime";
import { printJson } from "../formatter/format-parsed";

export async function handleProfile(
	runtime: ClinicalRuntime,
	args: string[],
): Promise<void> {
	const sub = args[0];
	const stores = runtime.parserStores;

	if (sub === "list" || !sub) {
		const profiles = await stores.profiles.list();
		printJson(
			profiles.map((p) => ({
				profileId: p.profileId,
				personnelId: p.personnelId,
				isDefault: p.isDefault,
			})),
		);
		return;
	}

	if (sub === "get") {
		const profileId = args[1];
		if (!profileId) {
			console.error("usage: clinical profile get <profileId>");
			process.exit(1);
		}
		const profile = await stores.profiles.get(profileId);
		if (!profile) {
			console.error(`profile not found: ${profileId}`);
			process.exit(1);
		}
		printJson(profile);
		return;
	}

	console.error(`unknown profile subcommand: ${sub}`);
	process.exit(1);
}
