import { describe, expect, it } from "bun:test";
import {
	type ExtensionSettingsContribution,
	formatCategoryTitle,
	I18nKernel,
	SettingsContributionRegistry,
	SettingsUiModel,
	WorkspaceSettingsService,
} from "../src/workspace";

describe("Declarative Settings Form Widgets & Dynamic Categories", () => {
	it("translates category titles using i18n kernel and falls back gracefully", () => {
		const i18n = new I18nKernel("en");
		i18n.registerTranslations("en", {
			"settings.category.syntax": "Core Syntax (EN)",
			"settings.category.clinical": "Clinical & Pharmacology",
		});
		i18n.registerTranslations("es", {
			"settings.category.syntax": "Sintaxis Principal (ES)",
			"settings.category.clinical": "Farmacología y Clínica",
		});

		expect(formatCategoryTitle("syntax", i18n)).toBe("Core Syntax (EN)");
		expect(formatCategoryTitle("clinical", i18n)).toBe(
			"Clinical & Pharmacology",
		);

		i18n.setActiveLocale("es");
		expect(formatCategoryTitle("syntax", i18n)).toBe("Sintaxis Principal (ES)");
		expect(formatCategoryTitle("clinical", i18n)).toBe(
			"Farmacología y Clínica",
		);

		// Fallback when untranslated
		expect(formatCategoryTitle("unknownCategory", i18n)).toBe(
			"settings.category.unknownCategory",
		);
	});

	it("dynamically resolves extension settings with form widgets, categories, and groups", () => {
		const registry = new SettingsContributionRegistry();
		const i18n = new I18nKernel("en");
		i18n.registerTranslations("en", {
			"settings.category.syntax": "Syntax",
			"settings.category.clinical": "Clinical",
			"settings.group.tokens": "Tokens",
			"settings.group.safety": "Safety",
			"settings.group.terminology": "Terminology",
		});

		const clinicalContribution: ExtensionSettingsContribution = {
			namespace: "clinical",
			title: "Clinical Pharmacology",
			category: "clinical",
			schema: [
				{
					path: ["dosage", "strictMode"],
					type: "boolean",
					widget: "toggle",
					title: "Enforce Strict Dosage Bounds",
					category: "clinical",
					group: "safety",
					order: 1,
				},
				{
					path: ["dosage", "maxRate"],
					type: "number",
					widget: "slider",
					title: "Max Infusion Rate",
					min: 0,
					max: 500,
					step: 10,
					category: "clinical",
					group: "safety",
					order: 2,
				},
				{
					path: ["terminology", "aliases"],
					type: "array",
					widget: "tag-input",
					title: "Latin Frequency Shorthands",
					tagDelimiters: [",", " "],
					category: "clinical",
					group: "terminology",
					order: 10,
				},
			],
			defaults: {
				dosage: { strictMode: true, maxRate: 200 },
				terminology: { aliases: ["BID", "TID", "QHS"] },
			},
		};

		registry.register("clinical", clinicalContribution);

		const service = new WorkspaceSettingsService({
			defaults: {
				syntax: { trigger: "@" },
				...registry.getDefaults(),
			},
			schema: [
				{
					path: ["syntax", "trigger"],
					type: "string",
					widget: "input",
					category: "syntax",
					group: "tokens",
					title: "Trigger Symbol",
				},
				...registry.getSchema(),
			],
			storage: {
				read: () => null,
				write: () => {},
				reset: () => {},
			},
		});

		const uiModel = new SettingsUiModel(service, i18n);
		const snapshot = uiModel.getSnapshot();

		// Check sections
		expect(snapshot.sections.length).toBe(2);
		const syntaxSec = snapshot.sections.find((s) => s.id === "syntax");
		const clinicalSec = snapshot.sections.find((s) => s.id === "clinical");

		expect(syntaxSec).toBeDefined();
		expect(clinicalSec).toBeDefined();

		// Check clinical section groups and widgets
		expect(clinicalSec?.groups.length).toBe(2);
		const safetyGroup = clinicalSec?.groups.find((g) => g.title === "Safety");
		const termGroup = clinicalSec?.groups.find(
			(g) => g.title === "Terminology",
		);

		expect(safetyGroup).toBeDefined();
		expect(termGroup).toBeDefined();

		expect(safetyGroup?.items.length).toBe(2);
		expect(safetyGroup?.items[0]?.schema.widget).toBe("toggle");
		expect(safetyGroup?.items[1]?.schema.widget).toBe("slider");
		expect(safetyGroup?.items[1]?.schema.step).toBe(10);

		expect(termGroup?.items.length).toBe(1);
		expect(termGroup?.items[0]?.schema.widget).toBe("tag-input");
	});

	it("filters items by search query across groups, options, and categories", () => {
		const service = new WorkspaceSettingsService({
			defaults: {
				syntax: { radix: "." },
				clinical: { safetyLevel: "high" },
			},
			schema: [
				{
					path: ["syntax", "radix"],
					type: "enum",
					widget: "dropdown",
					category: "syntax",
					group: "Numerics",
					title: "Radix Point",
					enumValues: [".", ","],
				},
				{
					path: ["clinical", "safetyLevel"],
					type: "enum",
					widget: "dropdown",
					category: "clinical",
					group: "Safety",
					title: "Safety Threshold Level",
					enumValues: ["low", "medium", "high", "critical"],
				},
			],
			storage: {
				read: () => null,
				write: () => {},
				reset: () => {},
			},
		});

		const uiModel = new SettingsUiModel(service);

		// Search for enum option "critical"
		uiModel.setSearchQuery("critical");
		let snapshot = uiModel.getSnapshot();
		expect(snapshot.sections.length).toBe(1);
		expect(snapshot.sections[0]?.id).toBe("clinical");

		// Search for group "Numerics"
		uiModel.setSearchQuery("numerics");
		snapshot = uiModel.getSnapshot();
		expect(snapshot.sections.length).toBe(1);
		expect(snapshot.sections[0]?.id).toBe("syntax");

		// Clear search
		uiModel.setSearchQuery("");
		snapshot = uiModel.getSnapshot();
		expect(snapshot.sections.length).toBe(2);
	});
});
