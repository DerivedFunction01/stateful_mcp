import { describe, expect, it } from "bun:test";
import { bootstrapV2Session } from "../src/lib/session/bootstrap-v2";

describe("cli2 V2 bootstrap", () => {
	it("constructs the V2 engine without the legacy ClinicalEngineBuilder", async () => {
		const result = await bootstrapV2Session({ sessionId: "cli2-test" });
		expect(result.sessionId).toBe("cli2-test");
		expect(result.syntaxProfile.directCommandToken).toBe(":");
		expect(result.syntaxProfile.macroStartToken).toBe("^");
		expect(result.engine).toBeDefined();
	});

	it("accepts a configured V2 syntax profile", async () => {
		const result = await bootstrapV2Session({
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
