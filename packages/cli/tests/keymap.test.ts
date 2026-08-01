import { describe, expect, test } from "bun:test";
import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import { resolveKey } from "../src/lib/keymap";

const normal = "NORMAL" as const;

describe("resolveKey NORMAL — g w workspace", () => {
	test('"g" enters pending sequence, "w" resolves to OpenWorkspace', () => {
		const first = resolveKey("g", {}, normal, "");
		expect(first.action).toBeNull();
		expect(first.nextPending).toBe("g");

		const second = resolveKey("w", {}, normal, "g");
		expect(second.action).toBe(EditorAction.OpenWorkspace);
		expect(second.nextPending).toBe("");
	});

	test("existing dd/yy sequences remain unchanged", () => {
		expect(resolveKey("d", {}, normal, "").nextPending).toBe("d");
		expect(resolveKey("d", {}, normal, "d").action).toBe(
			EditorAction.DeleteCell,
		);
		expect(resolveKey("y", {}, normal, "y").action).toBe(EditorAction.YankCell);
	});

	test("[e / ]e navigation still works", () => {
		expect(resolveKey("e", {}, normal, "[").action).toBe(
			EditorAction.PrevError,
		);
		expect(resolveKey("e", {}, normal, "]").action).toBe(
			EditorAction.NextError,
		);
	});

	test("an unrelated second key clears the pending g", () => {
		const result = resolveKey("x", {}, normal, "g");
		expect(result.action).toBeNull();
		expect(result.nextPending).toBe("");
	});
});
