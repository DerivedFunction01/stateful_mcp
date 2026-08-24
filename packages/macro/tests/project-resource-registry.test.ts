import { describe, expect, it } from "bun:test";
import { ProjectResourceRegistry } from "../src/project/resource-registry";

describe("ProjectResourceRegistry", () => {
	it("registers ownership and validates schema versions", () => {
		const registry = new ProjectResourceRegistry();
		registry.register({
			kind: "notes",
			extensionId: "example.notes",
			schemaVersion: 2,
			migrationParticipantId: "example.notes.migrate",
		});

		expect(
			registry.validateReferences([
				{ resourceId: "one", kind: "notes", metadata: { schemaVersion: 2 } },
			]),
		).toEqual([]);
		expect(
			registry.validateReferences([
				{ resourceId: "one", kind: "notes", metadata: { schemaVersion: 1 } },
			]),
		).toHaveLength(1);
	});

	it("rejects duplicate ownership and unknown kinds", () => {
		const registry = new ProjectResourceRegistry();
		registry.register({ kind: "notes", schemaVersion: 1 });
		expect(() =>
			registry.register({
				kind: "notes",
				extensionId: "other",
				schemaVersion: 1,
			}),
		).toThrow();
		expect(
			registry.validateReferences([{ resourceId: "one", kind: "missing" }]),
		).toEqual(["Unknown resource kind 'missing'"]);
	});
});
