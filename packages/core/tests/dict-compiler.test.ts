import { describe, expect, test } from "bun:test";
import { DictionarySqlCompiler } from "../src/adapters/storage/sql/dict-compiler";

describe("PostgreSQL dictionary SQL compiler", () => {
	test("compiles independent dictionary tables and indexes", () => {
		const result = new DictionarySqlCompiler({
			dialect: "postgres",
			includeRelationCache: true,
		}).compileSchema();
		expect(result.ddl).toHaveLength(4);
		expect(result.ddl[1]?.sql).toContain('"data" JSONB NOT NULL');
		expect(result.ddl[2]?.sql).toContain(
			"policy IN ('whitelist', 'blacklist')",
		);
		expect(result.ddl[2]?.sql).toContain(
			'"active" BOOLEAN NOT NULL DEFAULT TRUE',
		);
		expect(
			result.indexes.some((query) => query.sql.includes("lookup_term")),
		).toBe(true);
	});

	test("compiles exact and prefix lookup values as PostgreSQL parameters", () => {
		const compiler = new DictionarySqlCompiler({ dialect: "postgres" });
		const exact = compiler.compileExpressionCandidates({
			lookupTerm: "shortness of breath",
			activeOnly: true,
			limit: 20,
		});
		const prefix = compiler.compileExpressionCandidates({
			lookupPrefix: "short",
			activeOnly: true,
			limit: 10,
		});
		expect(exact.sql).toContain('"lookup_term" = $1');
		expect(exact.params).toEqual(["shortness of breath", true]);
		expect(prefix.sql).toContain('"lookup_term" LIKE $1');
		expect(prefix.params).toEqual(["short%", true]);
		expect(exact.sql).not.toContain("shortness of breath");
	});

	test("pushes concept and role eligibility into a PostgreSQL join", () => {
		const query = new DictionarySqlCompiler({
			dialect: "postgres",
		}).compileJoinedCandidates({
			lookupPrefix: "short",
			roleName: "subjective.qualifier",
		});
		expect(query.sql).toContain('JOIN "dict_concepts" AS "c"');
		expect(query.sql).toContain("NOT EXISTS");
		expect(query.sql).toContain('"policy" = $');
		expect(query.params).toContain("subjective.qualifier");
		expect(query.params).toContain("short%");
	});

	test("compiles an expression/filter pair join without a concept join", () => {
		const query = new DictionarySqlCompiler({
			dialect: "postgres",
		}).compileExpressionFilterCandidates({
			lookupPrefix: "short",
			roleName: "subjective.qualifier",
		});
		expect(query.sql).not.toContain('JOIN "dict_concepts"');
		expect(query.sql).toContain('FROM "dict_custom_expressions" AS "e"');
		expect(query.sql).toContain("NOT EXISTS");
		expect(query.params).toContain("short%");
		expect(query.params).toContain("subjective.qualifier");
	});

	test("keeps PostgreSQL placeholders contiguous with bound join parameters", () => {
		const query = new DictionarySqlCompiler({
			dialect: "postgres",
		}).compileJoinedCandidates({
			lookupPrefix: "short",
			roleName: "subjective.qualifier",
		});
		const placeholders = [...query.sql.matchAll(/\$(\d+)/g)].map((match) =>
			Number(match[1]),
		);
		const expected = Array.from(
			{ length: query.params.length },
			(_, index) => index + 1,
		);
		expect(placeholders.length).toBe(query.params.length);
		expect([...new Set(placeholders)].sort((a, b) => a - b)).toEqual(expected);
	});
});
