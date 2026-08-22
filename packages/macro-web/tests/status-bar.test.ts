import { describe, expect, test } from "bun:test";
import { getVimCommandLabel } from "../src/components/StatusBar";

const commands = [
	{
		id: "workspace.saveActive",
		titleI18nKey: "menu.save",
		verb: "write",
		aliases: ["w", "write"],
	},
	{
		id: "workspace.saveAll",
		titleI18nKey: "workspace.saveAll",
		verb: "wall",
		aliases: ["wa", "wall", "writeall"],
	},
	{
		id: "custom.brickwall",
		titleI18nKey: "custom.brickwall.title",
		aliases: ["brick"],
	},
] as const;

describe("getVimCommandLabel", () => {
	test("matches runtime aliases and verbs without static defaults", () => {
		expect(
			getVimCommandLabel(":writeall", undefined, commands, (key) => key),
		).toBe(":writeall → workspace.saveAll");
		expect(
			getVimCommandLabel("WALL", undefined, commands, () => "Save All Tabs"),
		).toBe(":WALL → Save All Tabs");
	});

	test("uses localized command titles", () => {
		expect(
			getVimCommandLabel("brick", undefined, commands, (key) =>
				key === "custom.brickwall.title" ? "Muro personalizado" : key,
			),
		).toBe(":brick → Muro personalizado");
	});

	test("preserves unknown and empty command behavior", () => {
		expect(getVimCommandLabel(":unknown", undefined, commands)).toBe(
			":unknown",
		);
		expect(getVimCommandLabel("", ":", commands)).toBe(
			": [w, write, wa, wall, writeall, brick]",
		);
		expect(getVimCommandLabel("", undefined)).toBe(":");
	});
});
