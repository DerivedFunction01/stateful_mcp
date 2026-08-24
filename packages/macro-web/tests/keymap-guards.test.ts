import { describe, expect, test } from "bun:test";
import { parseKeymapProfile } from "../src/server/keymap-guards";

const validPartial = {
	profileId: "custom",
	name: "Custom",
	description: "A partial profile",
	normal: { moveDown: "j", moveUp: "k" },
	visual: { deleteSelection: "d" },
	sequences: { deleteCell: ["g", "d"] },
	keybindings: { command: "cmd" },
	aliases: { command: "cmd" },
};

describe("parseKeymapProfile", () => {
	test("accepts a well-formed partial profile", () => {
		expect(parseKeymapProfile(validPartial)).toBeTruthy();
	});

	test("accepts undefined as 'no override'", () => {
		expect(parseKeymapProfile(undefined)).toBeUndefined();
	});

	test("rejects non-object values", () => {
		expect(parseKeymapProfile(null)).toBeUndefined();
		expect(parseKeymapProfile("nope")).toBeUndefined();
		expect(parseKeymapProfile(42)).toBeUndefined();
	});

	test("rejects malformed string discriminator fields", () => {
		expect(parseKeymapProfile({ profileId: 5 })).toBeUndefined();
		expect(parseKeymapProfile({ name: 5 })).toBeUndefined();
		expect(parseKeymapProfile({ description: 5 })).toBeUndefined();
	});

	test("rejects malformed binding sections", () => {
		expect(parseKeymapProfile({ normal: "j" })).toBeUndefined();
		expect(parseKeymapProfile({ normal: { moveDown: 9 } })).toBeUndefined();
		expect(
			parseKeymapProfile({ visual: { deleteSelection: [9] } }),
		).toBeUndefined();
		expect(
			parseKeymapProfile({ sequences: { deleteCell: { bad: true } } }),
		).toBeUndefined();
	});

	test("rejects malformed keybindings/aliases", () => {
		expect(parseKeymapProfile({ keybindings: { command: 9 } })).toBeUndefined();
		expect(parseKeymapProfile({ keybindings: "command" })).toBeUndefined();
		expect(parseKeymapProfile({ aliases: "command" })).toBeUndefined();
		expect(parseKeymapProfile({ vim: 5 })).toBeUndefined();
	});
});
