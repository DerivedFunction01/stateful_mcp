import { describe, expect, it } from "bun:test";
import type { MacroArgumentInput } from "../../src/contracts/input";
import type { MacroSpec } from "../../src/contracts/macro";
import { parseMacroLine } from "../../src/parser/macro-parser";

describe("Sub-Ordered Slots in Unordered Grammar (Islands of Order)", () => {
	const defaultContext = {
		macroName: "box",
		lineIndex: 0,
		raw: "",
		syntax: { macroStartToken: "^" },
	};

	const boxMacroSpec: MacroSpec = {
		id: "shapes:box",
		name: "box",
		matching: {
			mode: "unordered",
			positionalFallback: true,
		},
		arguments: [
			{
				argumentId: "arg_name",
				name: "name",
				path: "name",
				matcher: { kind: "pattern", pattern: "^[A-Za-z]+$" },
			},
			{
				argumentId: "arg_shape",
				name: "shape",
				path: "shape",
				matcher: { kind: "pattern", pattern: "^(prism|cube|box)$" },
			},
			{
				argumentId: "arg_length",
				name: "length",
				path: "length",
				position: 0,
				matcher: { kind: "pattern", pattern: "^\\d+m$" },
			},
			{
				argumentId: "arg_width",
				name: "width",
				path: "width",
				position: 1,
				matcher: { kind: "pattern", pattern: "^\\d+m$" },
			},
			{
				argumentId: "arg_height",
				name: "height",
				path: "height",
				position: 2,
				matcher: { kind: "pattern", pattern: "^\\d+m$" },
			},
		],
	};

	it("binds identical-type scalar arguments sequentially by default positions", () => {
		// Input: ^box 20m something 15m prism 12m
		// Positions by default: length: 0, width: 1, height: 2
		const parsed = parseMacroLine(
			"^box 20m something 15m prism 12m",
			boxMacroSpec,
			{
				context: defaultContext,
			},
		);

		expect(parsed).not.toBeNull();
		expect(parsed!.diagnostics).toHaveLength(0);

		const lengthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "length",
		);
		const widthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "width",
		);
		const heightArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "height",
		);
		const nameArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "name",
		);
		const shapeArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "shape",
		);

		expect(lengthArg?.rawValue).toBe("20m");
		expect(widthArg?.rawValue).toBe("15m");
		expect(heightArg?.rawValue).toBe("12m");
		expect(nameArg?.rawValue).toBe("something");
		expect(shapeArg?.rawValue).toBe("prism");
	});

	it("respects subOrder override (e.g. width, height, length)", () => {
		// Input: ^box 20m something 15m prism 12m
		// User/project subOrder: ["width", "height", "length"]
		const parsed = parseMacroLine(
			"^box 20m something 15m prism 12m",
			boxMacroSpec,
			{
				context: defaultContext,
				subOrder: ["width", "height", "length"],
			},
		);

		expect(parsed).not.toBeNull();
		expect(parsed!.diagnostics).toHaveLength(0);

		const widthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "width",
		);
		const heightArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "height",
		);
		const lengthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "length",
		);
		const nameArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "name",
		);
		const shapeArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "shape",
		);

		expect(widthArg?.rawValue).toBe("20m");
		expect(heightArg?.rawValue).toBe("15m");
		expect(lengthArg?.rawValue).toBe("12m");
		expect(nameArg?.rawValue).toBe("something");
		expect(shapeArg?.rawValue).toBe("prism");
	});

	it("respects subOrder override (e.g. height, width, length)", () => {
		const parsed = parseMacroLine(
			"^box 20m something 15m prism 12m",
			boxMacroSpec,
			{
				context: defaultContext,
				subOrder: ["height", "width", "length"],
			},
		);

		expect(parsed).not.toBeNull();
		expect(parsed!.diagnostics).toHaveLength(0);

		const heightArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "height",
		);
		const widthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "width",
		);
		const lengthArg = parsed!.arguments.find(
			(a: MacroArgumentInput) => a.name === "length",
		);

		expect(heightArg?.rawValue).toBe("20m");
		expect(widthArg?.rawValue).toBe("15m");
		expect(lengthArg?.rawValue).toBe("12m");
	});
});
