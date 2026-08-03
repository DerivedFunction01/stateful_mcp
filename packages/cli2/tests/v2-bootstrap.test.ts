import { describe, expect, it } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-v2";

describe("cli2  bootstrap", () => {
	it("constructs the  engine without the legacy ClinicalEngineBuilder", async () => {
		const result = await bootstrapSession({ sessionId: "cli2-test" });
		expect(result.sessionId).toBe("cli2-test");
		expect(result.syntaxProfile.directCommandToken).toBe(":");
		expect(result.syntaxProfile.macroStartToken).toBe("^");
		expect(result.engine).toBeDefined();
	});

	it("accepts a configured  syntax profile", async () => {
		const result = await bootstrapSession({
			syntaxProfile: {
				profileId: "custom",
				active: true,
				default: true,
				directCommandToken: "/",
				macroStartToken: "~",
				directCommandMappings: { ok: "confirm" },
				editorCommandMappings: {},
			},
		});
		expect(result.syntaxProfile.directCommandToken).toBe("/");
		expect(result.syntaxProfile.macroStartToken).toBe("~");
	});
});
