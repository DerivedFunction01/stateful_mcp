import { describe, expect, test } from "bun:test";
import {
	type SettingsSchemaEntry,
	WorkspaceSettingsService,
} from "../src/workspace/config/settings-service";
import { SettingsUiModel } from "../src/workspace/config/settings-ui-model";

describe("SettingsUiModel", () => {
	const schema: SettingsSchemaEntry[] = [
		{
			path: ["syntax", "macroStartToken"],
			type: "string",
			title: "Expression Trigger Token",
			description: "Symbol used to initiate macro invocations.",
		},
		{
			path: ["values", "decimalSeparator"],
			type: "enum",
			title: "Decimal Separator",
			description: "Radix character.",
			enumValues: [".", ","],
		},
		{
			path: ["appearance", "theme"],
			type: "enum",
			title: "Color Theme",
			description: "Active UI theme.",
			enumValues: ["dark-modern", "light", "high-contrast"],
		},
	];

	const defaults = {
		syntax: { macroStartToken: "@" },
		values: { decimalSeparator: "." },
		appearance: { theme: "dark-modern" },
	};

	const mockStorage = {
		read: () => JSON.stringify(defaults),
		write: () => {},
		reset: () => {},
	};

	test("initializes snapshot with default values and sections", () => {
		const service = new WorkspaceSettingsService({
			defaults,
			schema,
			storage: mockStorage,
		});
		const uiModel = new SettingsUiModel(service);

		const snapshot = uiModel.getSnapshot();
		expect(snapshot.activeProfileId).toBe("base");
		expect(snapshot.activeScope).toBe("workspace");
		expect(snapshot.totalModifiedCount).toBe(0);
		expect(snapshot.sections.length).toBe(3);

		const syntaxSection = snapshot.sections.find((s) => s.id === "syntax");
		expect(syntaxSection).toBeDefined();
		expect(syntaxSection?.title).toBe("settings.category.syntax");
		expect(syntaxSection?.items[0]?.value).toBe("@");
		expect(syntaxSection?.items[0]?.origin.kind).toBe("inherited");
	});

	test("tracks modified values and updates origin badge", () => {
		const service = new WorkspaceSettingsService({
			defaults,
			schema,
			storage: mockStorage,
		});
		const uiModel = new SettingsUiModel(service);

		uiModel.setValue(["values", "decimalSeparator"], ",");
		const snapshot = uiModel.getSnapshot();

		expect(snapshot.totalModifiedCount).toBe(1);
		const valuesSection = snapshot.sections.find((s) => s.id === "values");
		const decimalItem = valuesSection?.items.find(
			(i) => i.schema.path.join(".") === "values.decimalSeparator",
		);
		expect(decimalItem?.isModified).toBe(true);
		expect(decimalItem?.value).toBe(",");
		expect(decimalItem?.origin.kind).toBe("overridden");
	});

	test("filters by search query", () => {
		const service = new WorkspaceSettingsService({
			defaults,
			schema,
			storage: mockStorage,
		});
		const uiModel = new SettingsUiModel(service);

		uiModel.setSearchQuery("decimal");
		const snapshot = uiModel.getSnapshot();

		expect(snapshot.sections.length).toBe(1);
		expect(snapshot.sections[0]?.id).toBe("values");
		expect(snapshot.sections[0]?.items[0]?.schema.title).toBe(
			"Decimal Separator",
		);
	});

	test("toggles dual-mode split JSON", () => {
		const service = new WorkspaceSettingsService({
			defaults,
			schema,
			storage: mockStorage,
		});
		const uiModel = new SettingsUiModel(service);

		expect(uiModel.getIsSplitJsonMode()).toBe(false);
		uiModel.toggleSplitJsonMode();
		expect(uiModel.getIsSplitJsonMode()).toBe(true);

		uiModel.replaceRawJson(
			JSON.stringify({
				syntax: { macroStartToken: "!" },
				values: { decimalSeparator: "." },
				appearance: { theme: "dark-modern" },
			}),
		);

		const snapshot = uiModel.getSnapshot();
		const syntaxSection = snapshot.sections.find((s) => s.id === "syntax");
		expect(syntaxSection?.items[0]?.value).toBe("!");
	});
});
