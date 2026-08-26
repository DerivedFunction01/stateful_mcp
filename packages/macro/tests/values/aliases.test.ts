import { describe, expect, test } from "bun:test";
import {
	type AliasDefinition,
	type AliasResolver,
	compileAliasRegistry,
	type ResolverContext,
	resolveAlias,
} from "../../src/values/aliases";

const now = new Date("2026-08-25T12:00:00.000Z");

function context(overrides: Partial<ResolverContext> = {}): ResolverContext {
	return {
		nowUtc: now,
		timezone: "America/New_York",
		locale: "en-US",
		calendar: "gregory",
		...overrides,
	};
}

const fiscalResolver: AliasResolver = (_params, ctx) => {
	const quarter =
		ctx.nowUtc.getUTCMonth() < 3
			? "Q1"
			: ctx.nowUtc.getUTCMonth() < 6
				? "Q2"
				: ctx.nowUtc.getUTCMonth() < 9
					? "Q3"
					: "Q4";
	return {
		value: `${ctx.calendar}:${quarter}`,
		precision: "quarter",
		requiredContext: ["nowUtc", "calendar"],
	};
};

const resolvers = { fiscal: fiscalResolver };

describe("alias registry", () => {
	test("resolves an explicit canonical-id spelling (canonical id not auto-accepted)", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "usd",
				namespace: "canonical-id",
				spellings: ["dollar", "bucks"],
				target: { kind: "canonical", value: "iso:USD" },
			},
		];
		const registry = compileAliasRegistry(defs);
		expect(registry.diagnostics).toEqual([]);

		const hit = resolveAlias(registry, "canonical-id", "bucks", context());
		expect(hit).toBeDefined();
		expect(hit?.target.value).toBe("iso:USD");
		expect(hit?.spelling).toBe("bucks");

		const canonicalMiss = resolveAlias(
			registry,
			"canonical-id",
			"usd",
			context(),
		);
		expect(canonicalMiss).toBeUndefined();
	});

	test("rejects a missing canonical spelling", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "eur",
				namespace: "canonical-id",
				spellings: ["euro"],
				target: { kind: "canonical", value: "iso:EUR" },
			},
		];
		const registry = compileAliasRegistry(defs);
		const miss = resolveAlias(registry, "canonical-id", "eur", context());
		expect(miss).toBeUndefined();
	});

	test("resolver receives injected context and returns typed target", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "fiscal-q",
				namespace: "resolver",
				spellings: ["current quarter"],
				target: { kind: "resolver", resolverId: "fiscal", params: {} },
			},
		];
		const registry = compileAliasRegistry(defs, resolvers);
		expect(registry.diagnostics).toEqual([]);

		const resolved = resolveAlias(
			registry,
			"resolver",
			"current quarter",
			context(),
			resolvers,
		);
		expect(resolved?.target.value).toBe("gregory:Q3");
		expect(resolved?.target.precision).toBe("quarter");
		expect(resolved?.target.requiredContext).toEqual(["nowUtc", "calendar"]);
	});

	test("namespace isolation: spellings do not leak across namespaces", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "lit-one",
				namespace: "literal",
				spellings: ["same"],
				target: { kind: "literal", value: "LITERAL" },
			},
			{
				id: "canon-one",
				namespace: "canonical-id",
				spellings: ["same"],
				target: { kind: "canonical", value: "CANON" },
			},
		];
		const registry = compileAliasRegistry(defs);
		expect(registry.diagnostics).toEqual([]);

		const fromLiteral = resolveAlias(registry, "literal", "same", context());
		expect(fromLiteral?.target.value).toBe("LITERAL");

		const fromCanonical = resolveAlias(
			registry,
			"canonical-id",
			"same",
			context(),
		);
		expect(fromCanonical?.target.value).toBe("CANON");
	});

	test("case flag affects matching", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "ci",
				namespace: "literal",
				spellings: ["Color"],
				caseSensitive: false,
				target: { kind: "literal", value: "X" },
			},
			{
				id: "cs",
				namespace: "canonical-id",
				spellings: ["Tag"],
				caseSensitive: true,
				target: { kind: "canonical", value: "Y" },
			},
		];
		const registry = compileAliasRegistry(defs);

		expect(
			resolveAlias(registry, "literal", "color", context())?.target.value,
		).toBe("X");
		expect(
			resolveAlias(registry, "canonical-id", "tag", context()),
		).toBeUndefined();
		expect(
			resolveAlias(registry, "canonical-id", "Tag", context())?.target.value,
		).toBe("Y");
	});

	test("compile diagnostics: duplicate id, conflicting spelling, unknown resolver, invalid", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "dup",
				namespace: "literal",
				spellings: ["a"],
				target: { kind: "literal", value: "1" },
			},
			{
				id: "dup",
				namespace: "literal",
				spellings: ["b"],
				target: { kind: "literal", value: "2" },
			},
			{
				id: "conflict",
				namespace: "literal",
				spellings: ["word"],
				target: { kind: "literal", value: "3" },
			},
			{
				id: "conflict2",
				namespace: "literal",
				spellings: ["word"],
				target: { kind: "literal", value: "4" },
			},
			{
				id: "bad-resolver",
				namespace: "resolver",
				spellings: ["x"],
				target: { kind: "resolver", resolverId: "missing" },
			},
			{
				id: "no-spellings",
				namespace: "literal",
				spellings: [],
				target: { kind: "literal", value: "5" },
			},
		];
		const registry = compileAliasRegistry(defs, resolvers);

		const byCode = registry.diagnostics.map((diagnostic) => diagnostic.code);
		expect(byCode).toContain("ALIAS_DUPLICATE_ID");
		expect(byCode).toContain("ALIAS_CONFLICTING_SPELLING");
		expect(byCode).toContain("ALIAS_UNKNOWN_RESOLVER");
		expect(byCode).toContain("ALIAS_INVALID_DEFINITION");

		for (const diagnostic of registry.diagnostics) {
			expect(diagnostic.messageKey).toBeDefined();
			expect((diagnostic as { message?: string }).message).toBeUndefined();
		}
	});

	test("longest-match wins within a namespace", () => {
		const defs: readonly AliasDefinition[] = [
			{
				id: "short",
				namespace: "literal",
				spellings: ["new"],
				target: { kind: "literal", value: "SHORT" },
			},
			{
				id: "long",
				namespace: "literal",
				spellings: ["new york"],
				target: { kind: "literal", value: "LONG" },
			},
		];
		const registry = compileAliasRegistry(defs);
		expect(
			resolveAlias(registry, "literal", "new york", context())?.target.value,
		).toBe("LONG");
	});
});
