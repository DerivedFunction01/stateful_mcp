import { describe, expect, test } from "bun:test";
import { dispatchGeneralWindowCommand } from "../src/lib/windows/notebook/extension";

describe("general window command dispatch", () => {
	test.each([
		[":q", "quit"],
		[":quit", "quit"],
		[":h", "show_help"],
		[":help", "show_help"],
		[":w", "save"],
		[":wq", "save_quit"],
	])("dispatches %s", (line, action) => {
		expect(dispatchGeneralWindowCommand(line)).toMatchObject({
			success: true,
			action,
		});
	});

	test("ignores unrelated commands", () => {
		expect(dispatchGeneralWindowCommand(":branch main")).toBeNull();
	});
});
