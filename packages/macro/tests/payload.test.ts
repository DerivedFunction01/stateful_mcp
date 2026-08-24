import { describe, expect, test } from "bun:test";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type { MacroSpec } from "../src/contracts/macro";
import { compileMacroPayload } from "../src/payload/payload-compiler";
import { createExpressionBackendFixture } from "./support/expression-backend-fixture";

const backend = createExpressionBackendFixture([
	{ id: "hp", term: "hp", canonicalValue: { id: "book-series" } },
]);

const context = createMacroRuntimeContext({ macroStartToken: "^" });

const spec: MacroSpec = {
	id: "note",
	name: "note",
	matching: { mode: "unordered", positionalFallback: true },
	arguments: [
		{
			argumentId: "title",
			name: "title",
			path: "foo.path.args.title",
			matcher: { kind: "expression", backendId: "books" },
		},
		{
			argumentId: "year",
			name: "year",
			path: "foo.path.args.year",
			matcher: { kind: "pattern", pattern: "(?<value>20\\d{2})" },
			scalarType: "integer",
		},
	],
};

describe("neutral payload compiler", () => {
	test("materializes nested paths from typed and backend values", () => {
		const result = compileMacroPayload(spec, "^note year=2004 title=hp", {
			context,
			backends: { books: backend },
			mode: "execute",
		});
		expect(result.status).toBe("matched");
		expect(result.payload).toEqual({
			foo: { path: { args: { title: { id: "book-series" }, year: 2004 } } },
		});
	});

	test("keeps a prefix incomplete during live compilation", () => {
		const prefixBackend = createExpressionBackendFixture([
			{ id: "hp", term: "harry potter", canonicalValue: "series" },
		]);
		const result = compileMacroPayload(spec, "^note harry pot", {
			context,
			backends: { books: prefixBackend },
		});
		expect(result.status).toBe("incomplete");
		expect(
			result.arguments.find((argument) => argument.argumentId === "title")
				?.state,
		).toBe("pending");
	});

	test("reports conflicting writes instead of overwriting", () => {
		const conflictSpec: MacroSpec = {
			...spec,
			arguments: spec.arguments.map((argument) => ({
				...argument,
				path: "same.value",
			})),
		};
		const result = compileMacroPayload(
			conflictSpec,
			"^note year=2004 title=hp",
			{ context, backends: { books: backend }, mode: "execute" },
		);
		expect(
			result.diagnostics.some(
				(diagnostic) => diagnostic.code === "PATH_CONFLICT",
			),
		).toBe(true);
		const conflict = result.diagnostics.find(
			(diagnostic) => diagnostic.code === "PATH_CONFLICT",
		);
		expect(conflict?.messageKey).toBe("errors.payloadPathDuplicate");
		expect(conflict?.messageParams).toEqual({ path: "same.value" });
		expect(conflict?.message).toBe("errors.payloadPathDuplicate");
	});
});
