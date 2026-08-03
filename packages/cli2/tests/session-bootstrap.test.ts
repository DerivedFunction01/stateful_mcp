import { describe, expect, test } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap";

describe("bootstrapSession", () => {
	test("fails explicitly until the V2 runtime bootstrap is wired", async () => {
		await expect(bootstrapSession()).rejects.toThrow(/V2 bootstrap is not wired/);
	});
});
