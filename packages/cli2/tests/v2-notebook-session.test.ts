import { describe, expect, it } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-v2";

describe("cli2  notebook session seam", () => {
	it("exposes  services without a legacy NotebookStore", async () => {
		const result = await bootstrapSession({ sessionId: "cli2-notebook" });
		const suggestions = await result.notebook.getAutocomplete({
			input: ":con",
			cursorOffset: 4,
			sessionId: result.sessionId,
		});
		expect(result.notebook.engine).toBe(result.engine);
		expect(result.notebook.sessionId).toBe("cli2-notebook");
		expect(
			suggestions.some((suggestion) =>
				suggestion.insertText.includes("confirm"),
			),
		).toBe(true);
	});
});
