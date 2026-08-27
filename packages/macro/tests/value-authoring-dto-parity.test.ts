import { describe, expect, test } from "bun:test";
import { parseValueAuthoringProfileDto } from "@stateful-mcp/macro-protocol";
import type { UserMacroProfile } from "../src/contracts/extension-config";
import { serializeValueAuthoringProfile } from "../src/workspace/config/value-authoring";

describe("value authoring protocol DTO parity", () => {
	test("serialized profile passes the protocol boundary guard", () => {
		const profile: UserMacroProfile = {
			id: "parity",
			extends: "base",
			locale: "en-US",
			syntax: { macroStartToken: "^", argumentDelimiter: "," },
			localization: { customDigitMap: { "٠": "0" } },
			numberWords: {
				atoms: { one: "1" },
				scales: [{ word: "thousand", value: 1000, type: "major" }],
			},
			excludePrefixes: ["no "],
			unitAliases: { meter: ["m", "meters"] },
			operatorAliases: { gte: [">=", "at least"] },
			statisticalAliases: { mean: ["mean", "avg"] },
			aliases: [
				{
					id: "alias-usd",
					namespace: "canonical-id",
					spellings: ["$"],
					lexiconId: "currency.marker",
					target: { kind: "canonical", value: "USD" },
				},
			],
			fundamentals: [
				{
					id: "fund",
					variants: [
						{
							id: "v",
							prefix: [{ id: "p", text: "value" }],
							slots: [{ id: "num", pattern: "\\d+" }],
							connectors: [[{ id: "c", text: "-", boundary: "none" as const }]],
							postfix: [{ id: "sfx", text: "!" }],
						},
					],
				},
			],
			recipes: [
				{
					id: "recipe",
					root: {
						kind: "fundamental",
						groupId: "fund",
						children: [{ kind: "terminal", consumerId: "text" }],
					},
					priority: 5,
					capability: {
						valueKind: "date-time",
						providedFields: ["year"],
					},
				},
			],
			removedIds: { aliases: ["gone"], recipes: [] },
			values: {
				dateTime: {
					formats: {
						"date.iso": {
							id: "date.iso",
							kind: "date",
							source: "YYYY-MM-DD",
						},
					},
					display: { date: "date.iso" },
					parse: { date: ["date.iso"], time: [], datetime: [] },
				},
			},
		};

		const serialized = serializeValueAuthoringProfile(profile);
		const guarded = parseValueAuthoringProfileDto(serialized);
		expect(guarded.ok).toBe(true);
		if (!guarded.ok) return;
		expect(guarded.profile.id).toBe("parity");
		expect(guarded.profile.extends).toBe("base");
		expect(guarded.profile.aliases?.[0]?.lexiconId).toBe("currency.marker");
		expect(guarded.profile.recipes?.[0]?.capability?.valueKind).toBe(
			"date-time",
		);
		expect(guarded.profile.removedIds).toEqual({
			aliases: ["gone"],
			recipes: [],
		});
	});

	test("guard rejects missing id and runtime resolver fields", () => {
		const missingId = parseValueAuthoringProfileDto({ aliases: [] });
		expect(missingId.ok).toBe(false);
		if (!missingId.ok) {
			expect(missingId.errors[0]?.code).toBe("PROFILE_ID_MISSING");
		}

		const withResolvers = parseValueAuthoringProfileDto({
			id: "runtime",
			aliasResolvers: { clock: () => ({}) },
		});
		expect(withResolvers.ok).toBe(false);
		if (!withResolvers.ok) {
			expect(withResolvers.errors[0]?.code).toBe("PROFILE_RUNTIME_FIELD");
		}
	});

	test("guard rejects non-object payloads and malformed collections", () => {
		expect(parseValueAuthoringProfileDto(null).ok).toBe(false);
		expect(parseValueAuthoringProfileDto([1]).ok).toBe(false);
		const badCollections = parseValueAuthoringProfileDto({
			id: "x",
			aliases: "not-an-array",
		});
		expect(badCollections.ok).toBe(false);
		if (!badCollections.ok) {
			expect(badCollections.errors[0]?.code).toBe("PROFILE_COLLECTION_INVALID");
		}
	});

	test("serialization strips runtime-only resolvers before transport", () => {
		const profile = {
			id: "resolver-strip",
			aliases: [],
			fundamentals: [],
			recipes: [],
			aliasResolvers: { "clock.today": () => ({ value: "x" }) },
		} as unknown as UserMacroProfile & {
			aliasResolvers?: Record<string, unknown>;
		};
		const serialized = serializeValueAuthoringProfile(profile);
		const guarded = parseValueAuthoringProfileDto(serialized);
		expect(guarded.ok).toBe(true);
		if (guarded.ok) {
			expect(
				(guarded.profile as unknown as Record<string, unknown>).aliasResolvers,
			).toBeUndefined();
		}
	});
});
