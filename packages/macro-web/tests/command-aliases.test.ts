import { describe, expect, test } from "bun:test";
import {
	commandSuggestions,
	normalizeCommandAliases,
	type WorkspaceCommandDescriptor,
} from "@stateful-mcp/macro";

describe("Canonical Commands & Dynamic Multi-Alias Resolution", () => {
	const descriptors: WorkspaceCommandDescriptor[] = [
		{
			id: "workspace.saveActive",
			title: "Save Active Tab",
			category: "Workspace",
			execute: () => undefined,
		},
		{
			id: "workspace.saveAll",
			title: "Save All Tabs",
			category: "Workspace",
			execute: () => undefined,
		},
		{
			id: "custom.brickwall",
			title: "Build Brick Wall",
			category: "Custom",
			execute: () => undefined,
		},
	];

	test("normalizes multi-alias mappings into a lookup map", () => {
		const aliasConfig = {
			"workspace.saveActive": ["w", "write"],
			"workspace.saveAll": ["wa", "wall", "writeall", "saveall"],
		};

		const map = normalizeCommandAliases(aliasConfig);
		expect(map.get("w")).toBe("workspace.saveActive");
		expect(map.get("write")).toBe("workspace.saveActive");
		expect(map.get("wa")).toBe("workspace.saveAll");
		expect(map.get("wall")).toBe("workspace.saveAll");
		expect(map.get("writeall")).toBe("workspace.saveAll");
		expect(map.get("saveall")).toBe("workspace.saveAll");
	});

	test("suggests commands using dynamic multi-alias prefixes without static defaults", () => {
		const aliasMap = normalizeCommandAliases({
			"workspace.saveActive": ["w", "write"],
			"workspace.saveAll": ["wa", "wall", "writeall"],
		});

		// Querying :w should match both :w (saveActive), :wa (saveAll), :wall (saveAll), :write (saveActive), :writeall (saveAll)
		const suggestions = commandSuggestions(descriptors, aliasMap, ":w");
		const values = suggestions.map((s) => s.value);
		expect(values).toContain("w");
		expect(values).toContain("write");
		expect(values).toContain("wa");
		expect(values).toContain("wall");
		expect(values).toContain("writeall");
	});

	test("allows remapping 'wall' to another command with zero English bias", () => {
		// User maps "wall" to custom.brickwall, while "saveall" and "wa" still point to workspace.saveAll
		const customAliasMap = normalizeCommandAliases({
			"workspace.saveAll": ["wa", "saveall"],
			"custom.brickwall": ["wall"],
		});

		const wallSuggestions = commandSuggestions(
			descriptors,
			customAliasMap,
			":wall",
		);
		expect(wallSuggestions.length).toBeGreaterThan(0);
		expect(wallSuggestions[0]?.value).toBe("wall");
		expect(wallSuggestions[0]?.descriptor.id).toBe("custom.brickwall");
		expect(wallSuggestions[0]?.detail).toBe("Build Brick Wall");

		// :saveall still points to workspace.saveAll
		const saveallSuggestions = commandSuggestions(
			descriptors,
			customAliasMap,
			":saveall",
		);
		expect(saveallSuggestions[0]?.descriptor.id).toBe("workspace.saveAll");
	});
});
