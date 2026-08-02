import { describe, expect, test } from "bun:test";
import { validateStorageRuntimeConfig } from "../src/config/validator";

const memory = { _type: "adapter", name: "memory" } as const;

describe("storage runtime configuration", () => {
	test("accepts scoped routes with compatible capabilities", () => {
		expect(() =>
			validateStorageRuntimeConfig({
				filter: {
					session: {
						ttlMs: 60_000,
						route: {
							projection: {
								locator: memory,
								role: "projection",
								capabilities: { read: true, write: true },
								permissions: { read: true, write: true },
							},
						},
					},
				},
			}),
		).not.toThrow();
	});

	test("rejects permissions that exceed adapter capabilities", () => {
		expect(() =>
			validateStorageRuntimeConfig({
				dictionary: {
					concepts: {
						source: {
							locator: memory,
							role: "source",
							capabilities: { read: true, write: false },
							permissions: { write: true },
						},
					},
				},
			}),
		).toThrow(/exceeds capabilities/);
	});

	test("rejects non-positive session TTL", () => {
		expect(() =>
			validateStorageRuntimeConfig({
				object: { session: { ttlMs: 0 } },
			}),
		).toThrow(/ttlMs/);
	});
});
