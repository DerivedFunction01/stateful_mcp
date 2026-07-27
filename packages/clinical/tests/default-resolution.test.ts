import { describe, expect, test } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
} from "@stateful-mcp/core";
import type { CustomExpression } from "@stateful-mcp/core/src/middleware/dictionary/types";
import { CdslParser } from "../src/parser/cdsl-parser";
import type { ParsedObservationItem } from "../src/parser/schema-parsers";
import {
	type DefaultResolutionStrategy,
	registerDefaultResolutionStrategy,
} from "../src/store/default-strategy";
import { SEED_PARSER_PROFILES } from "../src/store/defaults";
import type { ParserSyntaxProfile } from "../src/store/interfaces";

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
	const conceptStore = (dictionaryStore as any)["conceptStore"];
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
			id: "1",
		},
	];
	for (const expr of expressions) await dictionaryStore.addExpression(expr);
}

function makeDictionaryStore() {
	return new DictionaryStore(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
}

describe("default resolution strategy (v2)", () => {
	test("uses profile schema defaults before global fallbacks", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

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

		const parser = new CdslParser(ds, profile);
		const parsed = await parser.parse("#observation fever");
		const observation = parsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;

		// v2: fields are in extractedData, not top-level properties
		expect(observation?.extractedData?.status).toBe("entered-in-error");
		expect(observation?.extractedData?.certainty).toBe("confirmed");
		expect(observation?.extractedData?.severity).toBe("mild");
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

		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "dynamic-resolution-profile",
			personnelId: "test",
			isDefault: true,
			defaultsStrategy: "MockDynamicStrategy",
		};

		const parser = new CdslParser(ds, profile);

		const feverParsed = await parser.parse("#observation fever");
		const feverObservation = feverParsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;

		const coughParsed = await parser.parse("#observation cough");
		const coughObservation = coughParsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;

		// v2: severity is in extractedData
		expect(feverObservation?.extractedData?.severity).toBe("critical");
		// "cough" has no concept match → parser returns nothing
		expect(coughObservation).toBeUndefined();
	});
});
