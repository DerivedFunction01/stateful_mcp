import { describe, expect, test } from "bun:test";
import { serializeSettingsUiSnapshot } from "../src/workspace/config/settings-projection";
import { WorkspaceSettingsService } from "../src/workspace/config/settings-service";
import { SettingsUiModel } from "../src/workspace/config/settings-ui-model";

describe("settings UI projection", () => {
	test("serializes canonical fields, origins, and sensitive redaction", () => {
		const service = new WorkspaceSettingsService({
			defaults: {
				appearance: { theme: "light" },
				secretToken: "initial-secret",
			},
			schema: [
				{
					path: ["appearance", "theme"],
					type: "string",
					title: "Theme",
					category: "appearance",
				},
				{
					path: ["secretToken"],
					type: "string",
					title: "Secret token",
					category: "security",
					sensitive: true,
				},
			],
		});
		const model = new SettingsUiModel(service);
		service.setPath(["appearance", "theme"], "dark");
		const projection = serializeSettingsUiSnapshot(model.getSnapshot(), {
			settingsRevision: "macro-settings:test",
		});
		const items = projection.sections.flatMap((section) => section.items);
		const theme = items.find(
			(item) => item.path.join(".") === "appearance.theme",
		);
		const secret = items.find((item) => item.path.join(".") === "secretToken");
		expect(theme?.value).toBe("dark");
		expect(theme?.isModified).toBe(true);
		expect(theme?.origin.kind).toBe("overridden");
		expect(secret?.value).toBe("••••••••");
		expect(secret?.effectiveValue).toBe("••••••••");
		expect(projection.rawJsonText).not.toContain("initial-secret");
		expect(projection.jsonModeAvailable).toBe(false);
		expect(projection.settingsRevision).toBe("macro-settings:test");
	});

	test("advertises only host-supported workspace scope", () => {
		const service = new WorkspaceSettingsService({ defaults: {} });
		const model = new SettingsUiModel(service);
		const projection = serializeSettingsUiSnapshot(model.getSnapshot(), {
			supportedScopes: ["workspace"],
		});
		expect(projection.activeScope).toBe("workspace");
		expect(projection.supportedScopes).toEqual(["workspace"]);
		expect(projection.unsupportedScopeReason).toBeUndefined();
	});
});
