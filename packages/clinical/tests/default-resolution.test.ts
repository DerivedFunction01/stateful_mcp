import { describe, expect, test } from "bun:test";
import {
	DictionaryStore,
	InMemoryConceptResolver,
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import type { ParsedObservationItem } from "../src/parser/schema-parsers";
import {
	type DefaultResolutionStrategy,
	registerDefaultResolutionStrategy,
} from "../src/store/default-strategy";
import { SEED_PARSER_PROFILES } from "../src/store/defaults";
import type { ParserSyntaxProfile } from "../src/store/interfaces";

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
	const conceptStore = dictionaryStore["conceptStore"];
	await conceptStore.addNamespace({
		code: "SNOMED",
		description: "SNOMED",
		isPublic: true,
		isExternalPrivate: false,
	});

	await conceptStore.addConcept({
		id: "SNOMED::29857009",
		standardCode: "29857009",
		display: "Fever",
		namespaceCode: "SNOMED",
		active: true,
	});

	const expressions: CustomExpression[] = [
		{
			term: "fever",
			regexPattern: "\\bfever\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
		},
	];

	for (const expr of expressions) {
		await dictionaryStore.addExpression(expr);
	}
}

describe("default resolution strategy", () => {
	test("uses profile schema defaults before global fallbacks", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);
		await seedTestConcepts(dictionaryStore);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "default-resolution-profile",
			personnelId: "test",
			isDefault: true,
			schemaDefaults: {
				ObservationEvent: {
					status: "entered-in-error",
					certainty: "confirmed",
					severity: "mild",
				},
			},
			defaultsStrategy: "StaticSchemaDefaults",
		};

		const parser = new CdslParser(dictionaryStore, profile);
		const parsed = await parser.parse("#observation fever");
		const observation = parsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;

		expect(observation?.status).toBe("entered-in-error");
		expect(observation?.certainty).toBe("confirmed");
		expect(observation?.severity).toBe("mild");
	});

	test("uses a dynamic strategy registered in the profile", async () => {
		class MockDynamicStrategy implements DefaultResolutionStrategy {
			resolveDefault<T>(
				schemaName: string,
				fieldName: string,
				context?: { rawText?: string; parsedPartial?: Record<string, any> },
			): T | undefined {
				if (schemaName === "ObservationEvent" && fieldName === "severity") {
					return (
						context?.rawText?.toLowerCase().includes("fever")
							? "critical"
							: "moderate"
					) as T;
				}
				return undefined;
			}
		}

		registerDefaultResolutionStrategy(
			"MockDynamicStrategy",
			new MockDynamicStrategy(),
		);

		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);
		await seedTestConcepts(dictionaryStore);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "dynamic-resolution-profile",
			personnelId: "test",
			isDefault: true,
			defaultsStrategy: "MockDynamicStrategy",
		};

		const parser = new CdslParser(dictionaryStore, profile);
		const feverParsed = await parser.parse("#observation fever");
		const feverObservation = feverParsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;
		const coughParsed = await parser.parse("#observation cough");
		const coughObservation = coughParsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;

		expect(feverObservation?.severity).toBe("critical");
		expect(coughObservation).toBeUndefined();
	});
});
