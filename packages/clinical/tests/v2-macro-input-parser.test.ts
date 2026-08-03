import { describe, expect, test } from "bun:test";
import { parseMacroLine } from "../src/v2/macros/macro-input-parser";

describe("macro-input-parser", () => {
	describe("non-macro lines", () => {
		test("returns null for prose without leading macro token", () => {
			expect(parseMacroLine("Patient has chest pain")).toBeNull();
		});

		test("returns null for empty string", () => {
			expect(parseMacroLine("")).toBeNull();
		});

		test("returns null for whitespace only", () => {
			expect(parseMacroLine("   \t  ")).toBeNull();
		});

		test("returns null for line starting with non-macro character", () => {
			expect(parseMacroLine("#comment")).toBeNull();
		});
	});

	describe("macro name extraction", () => {
		test("extracts simple macro name", () => {
			const result = parseMacroLine("^observation");
			expect(result).not.toBeNull();
			expect(result!.macroName).toBe("observation");
			expect(result!.arguments).toHaveLength(0);
		});

		test("extracts macro name with leading whitespace", () => {
			const result = parseMacroLine("   ^observation");
			expect(result).not.toBeNull();
			expect(result!.macroName).toBe("observation");
		});

		test("extracts macro name with tabs as leading whitespace", () => {
			const result = parseMacroLine("\t\t^observation");
			expect(result).not.toBeNull();
			expect(result!.macroName).toBe("observation");
		});

		test("returns null for macro token with no name", () => {
			expect(parseMacroLine("^")).toBeNull();
		});

		test("uses custom macro start token", () => {
			const result = parseMacroLine(">>observation", 1, {
				macroStartToken: ">>",
			});
			expect(result).not.toBeNull();
			expect(result!.macroName).toBe("observation");
		});

		test("returns null when custom start token does not match", () => {
			expect(parseMacroLine("^observation", 1, {
				macroStartToken: ">>",
			})).toBeNull();
		});
	});

	describe("named argument parsing", () => {
		test("parses a single named argument", () => {
			const result = parseMacroLine("^observation concept=chest");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(1);
			expect(result!.arguments[0]).toEqual({
				name: "concept",
				position: 0,
				rawValue: "chest",
				source: "named",
				line: 0,
			});
		});

		test("parses multiple named arguments", () => {
			const result = parseMacroLine(
				"^observation concept=chest severity=mild",
			);
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(2);
			expect(result!.arguments[0]).toEqual({
				name: "concept",
				position: 0,
				rawValue: "chest",
				source: "named",
				line: 0,
			});
			expect(result!.arguments[1]).toEqual({
				name: "severity",
				position: 1,
				rawValue: "mild",
				source: "named",
				line: 0,
			});
		});

		test("position indices are 0-based and consecutive", () => {
			const result = parseMacroLine(
				"^obs a=1 b=2 c=3 d=4 e=5",
			);
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(5);
			result!.arguments.forEach((arg, idx) => {
				expect(arg.position).toBe(idx);
			});
		});
	});

	describe("positional argument parsing", () => {
		test("parses a single positional argument", () => {
			const result = parseMacroLine("^observation chest");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(1);
			expect(result!.arguments[0]).toEqual({
				position: 0,
				rawValue: "chest",
				source: "positional",
				line: 0,
			});
		});

		test("parses multiple positional arguments", () => {
			const result = parseMacroLine("^observation chest pain mild");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(3);
			expect(result!.arguments[0]!.rawValue).toBe("chest");
			expect(result!.arguments[1]!.rawValue).toBe("pain");
			expect(result!.arguments[2]!.rawValue).toBe("mild");
		});
	});

	describe("mixed named and positional arguments", () => {
		test("parses named then positional", () => {
			const result = parseMacroLine("^obs concept=chest pain mild");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(3);
			expect(result!.arguments[0]).toEqual({
				name: "concept",
				position: 0,
				rawValue: "chest",
				source: "named",
				line: 0,
			});
			expect(result!.arguments[1]).toEqual({
				position: 1,
				rawValue: "pain",
				source: "positional",
				line: 0,
			});
			expect(result!.arguments[2]).toEqual({
				position: 2,
				rawValue: "mild",
				source: "positional",
				line: 0,
			});
		});

		test("parses positional then named", () => {
			const result = parseMacroLine("^obs chest pain severity=mild");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(3);
			expect(result!.arguments[0]).toEqual({
				position: 0,
				rawValue: "chest",
				source: "positional",
				line: 0,
			});
			expect(result!.arguments[1]).toEqual({
				position: 1,
				rawValue: "pain",
				source: "positional",
				line: 0,
			});
			expect(result!.arguments[2]).toEqual({
				name: "severity",
				position: 2,
				rawValue: "mild",
				source: "named",
				line: 0,
			});
		});
	});

	describe("quoted values", () => {
		test("parses double-quoted value with spaces", () => {
			const result = parseMacroLine(
				'^observation concept="chest pain" severity=mild',
			);
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(2);
			expect(result!.arguments[0]).toEqual({
				name: "concept",
				position: 0,
				rawValue: "chest pain",
				source: "named",
				line: 0,
			});
			expect(result!.arguments[1]).toEqual({
				name: "severity",
				position: 1,
				rawValue: "mild",
				source: "named",
				line: 0,
			});
		});

		test("parses single-quoted value with spaces", () => {
			const result = parseMacroLine(
				"^observation concept='chest pain' severity=mild",
			);
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(2);
			expect(result!.arguments[0]).toEqual({
				name: "concept",
				position: 0,
				rawValue: "chest pain",
				source: "named",
				line: 0,
			});
		});

		test("strips surrounding quotes from unquoted named value", () => {
			const result = parseMacroLine("^obs name=hello");
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe("hello");
		});

		test("preserves escaped quotes inside double-quoted value", () => {
			const result = parseMacroLine('^obs note="she said \\"hello\\""');
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe('she said "hello"');
		});

		test("preserves escaped quotes inside single-quoted value", () => {
			const result = parseMacroLine("^obs note='she said \\'hello\\''");
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe("she said 'hello'");
		});

		test("handles unclosed quote as raw to end of line", () => {
			const result = parseMacroLine('^obs note="unclosed');
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe("unclosed");
		});
	});

	describe("lineNumber mapping", () => {
		test("records provided lineNumber in sourceLines and arguments", () => {
			const result = parseMacroLine("^obs a=1 b=2", 42);
			expect(result).not.toBeNull();
			expect(result!.sourceLines).toEqual([{ line: 42, raw: "^obs a=1 b=2", macroName: "obs" }]);
			expect(result!.arguments[0]!.line).toBe(42);
			expect(result!.arguments[1]!.line).toBe(42);
		});

		test("defaults lineNumber to 0 when omitted", () => {
			const result = parseMacroLine("^obs a=1");
			expect(result).not.toBeNull();
			expect(result!.sourceLines).toEqual([{ line: 0, raw: "^obs a=1", macroName: "obs" }]);
			expect(result!.arguments[0]!.line).toBe(0);
		});
	});

	describe("sourceLines mapping", () => {
		test("populates sourceLines with raw and line number", () => {
			const raw = "  ^observation concept=chest pain  ";
			const result = parseMacroLine(raw, 7);
			expect(result).not.toBeNull();
			expect(result!.sourceLines).toEqual([{ line: 7, raw, macroName: "observation" }]);
		});

		test("records macroName on sourceLines when available", () => {
			const result = parseMacroLine("^observation concept=chest pain", 1);
			expect(result).not.toBeNull();
			expect(result!.sourceLines[0]!.macroName).toBe("observation");
		});
	});

	describe("edge cases", () => {
		test("tabs separate tokens", () => {
			const result = parseMacroLine("^obs\ta=1\tb=2");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(2);
			expect(result!.arguments[0]!.rawValue).toBe("1");
			expect(result!.arguments[1]!.rawValue).toBe("2");
		});

		test("handles empty named value", () => {
			const result = parseMacroLine("^obs note=");
			expect(result).not.toBeNull();
			expect(result!.arguments[0]).toEqual({
				name: "note",
				position: 0,
				rawValue: "",
				source: "named",
				line: 0,
			});
		});

		test("handles multiple spaces between tokens", () => {
			const result = parseMacroLine("^obs    concept=chest    pain   mild");
			expect(result).not.toBeNull();
			expect(result!.arguments).toHaveLength(3);
			expect(result!.arguments[0]!.rawValue).toBe("chest");
			expect(result!.arguments[1]!.rawValue).toBe("pain");
			expect(result!.arguments[2]!.rawValue).toBe("mild");
		});

		test("handles quoted value with tabs inside", () => {
			const result = parseMacroLine('^obs note="val\twith\ttabs"');
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe("val\twith\ttabs");
		});

		test("named value with equals inside quoted string", () => {
			const result = parseMacroLine('^obs expr="a = b + c"');
			expect(result).not.toBeNull();
			expect(result!.arguments[0]!.rawValue).toBe("a = b + c");
		});
	});
});
