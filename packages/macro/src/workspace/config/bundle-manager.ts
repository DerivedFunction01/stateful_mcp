import type { UserMacroProfile } from "../../contracts/extension-config";
import type { SettingsStorageDriver, WorkspaceSettings } from "./storage-driver";

export interface SettingsBundle {
	readonly $schema?: string;
	readonly version: 1;
	readonly exportedAt: string;
	readonly workspace?: WorkspaceSettings;
	readonly profiles?: Readonly<Record<string, Partial<UserMacroProfile>>>;
	readonly extensions?: Readonly<Record<string, Record<string, unknown>>>;
}

export async function exportSettingsBundle(
	driver: SettingsStorageDriver,
): Promise<SettingsBundle> {
	const workspace = await driver.loadSettings();

	const profileIds = await driver.listProfiles();
	const profiles: Record<string, Partial<UserMacroProfile>> = {};
	for (const id of profileIds) {
		const profile = await driver.loadProfile(id);
		if (profile) {
			profiles[id] = profile;
		}
	}

	const extensionIds = await driver.listExtensionConfigs();
	const extensions: Record<string, Record<string, unknown>> = {};
	for (const id of extensionIds) {
		const ext = await driver.loadExtensionConfig(id);
		if (ext) {
			extensions[id] = ext;
		}
	}

	return {
		$schema: "https://schema.stateful-mcp.org/settings-bundle.v1.json",
		version: 1,
		exportedAt: new Date().toISOString(),
		workspace,
		profiles: Object.freeze(profiles),
		extensions: Object.freeze(extensions),
	};
}

export async function importSettingsBundle(
	bundle: SettingsBundle,
	driver: SettingsStorageDriver,
	mode: "merge" | "replace" = "merge",
): Promise<void> {
	if (!bundle || bundle.version !== 1) {
		throw new Error("Invalid or unsupported settings bundle version");
	}

	if (mode === "replace") {
		const existingProfiles = await driver.listProfiles();
		for (const id of existingProfiles) {
			await driver.deleteProfile(id);
		}
	}

	if (bundle.workspace) {
		await driver.saveSettings(bundle.workspace);
	}

	if (bundle.profiles) {
		for (const [id, profileDelta] of Object.entries(bundle.profiles)) {
			await driver.saveProfile(id, profileDelta);
		}
	}

	if (bundle.extensions) {
		for (const [id, extConfig] of Object.entries(bundle.extensions)) {
			await driver.saveExtensionConfig(id, extConfig);
		}
	}
}
