import { describe, expect, test } from "bun:test";
import { createDefaultI18nKernel } from "../src/workspace/i18n/discovery";

describe("shared web-facing Macro translations", () => {
	test("resolves shared shell keys from the Macro locale aggregates", () => {
		const kernel = createDefaultI18nKernel("en");
		expect(kernel.t("nav.workbench")).toBe("Workbench");
		expect(kernel.t("workbench.project")).toBe("Project");
		kernel.setActiveLocale("es");
		expect(kernel.t("nav.workbench")).toBe("Espacio de trabajo");
		expect(kernel.t("workbench.project")).toBe("Proyecto");
	});

	test("does not register gallery-only keys in the shared Macro kernel", () => {
		const kernel = createDefaultI18nKernel("en");
		expect(kernel.t("gallery.title")).toBe("gallery.title");
	});
});
