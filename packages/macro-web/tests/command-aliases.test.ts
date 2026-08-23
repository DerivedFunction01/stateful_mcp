import { describe, expect, test } from "bun:test";
import {
	commandSuggestions,
	normalizeCommandAliases,
	type WorkspaceCommandDescriptor,
} from "@stateful-mcp/macro";

describe("Canonical Commands & Dynamic Multi-Alias Resolution", () => {
	const descriptors: WorkspaceCommandDescriptor[] = [
		{
			id: "editor.save",
			titleI18nKey: "command.editor.save",
			categoryI18nKey: "command.category.workspace",
			execute: () => undefined,
		},
		{
			id: "editor.saveAll",
			titleI18nKey: "command.workspace.saveAll",
			categoryI18nKey: "command.category.workspace",
			execute: () => undefined,
		},
		{
			id: "custom.brickwall",
			titleI18nKey: "custom.brickwall.title",
			categoryI18nKey: "command.category.custom",
			execute: () => undefined,
		},
	];

	test("normalizes multi-alias mappings into a lookup map", () => {
		const aliasConfig = {
			"editor.save": ["w", "write"],
			"editor.saveAll": ["wa", "wall", "writeall", "saveall"],
		};

		const map = normalizeCommandAliases(aliasConfig);
		expect(map.get("w")).toBe("editor.save");
		expect(map.get("write")).toBe("editor.save");
		expect(map.get("wa")).toBe("editor.saveAll");
		expect(map.get("wall")).toBe("editor.saveAll");
		expect(map.get("writeall")).toBe("editor.saveAll");
		expect(map.get("saveall")).toBe("editor.saveAll");
	});

	test("suggests commands using dynamic multi-alias prefixes without static defaults", () => {
		const aliasMap = normalizeCommandAliases({
			"editor.save": ["w", "write"],
			"editor.saveAll": ["wa", "wall", "writeall"],
		});

		// Querying :w should match both :w (save), :wa (saveAll), :wall (saveAll), :write (save), :writeall (saveAll)
		const suggestions = commandSuggestions(
			descriptors,
			aliasMap,
			":w",
			[],
			8,
			":",
		);
		const values = suggestions.map((s) => s.value);
		expect(values).toContain("w");
		expect(values).toContain("write");
		expect(values).toContain("wa");
		expect(values).toContain("wall");
		expect(values).toContain("writeall");
	});

	test("allows remapping 'wall' to another command with zero English bias", () => {
		// User maps "wall" to custom.brickwall, while "saveall" and "wa" still point to editor.saveAll
		const customAliasMap = normalizeCommandAliases({
			"editor.saveAll": ["wa", "saveall"],
			"custom.brickwall": ["wall"],
		});

		const wallSuggestions = commandSuggestions(
			descriptors,
			customAliasMap,
			":wall",
			[],
			8,
			":",
		);
		expect(wallSuggestions.length).toBeGreaterThan(0);
		expect(wallSuggestions[0]?.value).toBe("wall");
		expect(wallSuggestions[0]?.descriptor.id).toBe("custom.brickwall");
		expect(wallSuggestions[0]?.detail).toBe("custom.brickwall.title");

		// :saveall still points to editor.saveAll
		const saveallSuggestions = commandSuggestions(
			descriptors,
			customAliasMap,
			":saveall",
			[],
			8,
			":",
		);
		expect(saveallSuggestions[0]?.descriptor.id).toBe("editor.saveAll");
	});

	test("strips only the configured command token", () => {
		const suggestions = commandSuggestions(
			descriptors,
			normalizeCommandAliases({ "custom.brickwall": ["wall"] }),
			";wall",
			[],
			8,
			";",
		);

		expect(suggestions[0]?.value).toBe("wall");
		expect(
			commandSuggestions(
				descriptors,
				normalizeCommandAliases({ "custom.brickwall": ["wall"] }),
				":wall",
				[],
				8,
				";",
			),
		).toHaveLength(0);
	});
});
