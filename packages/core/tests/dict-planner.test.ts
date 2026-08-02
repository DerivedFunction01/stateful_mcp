import { describe, expect, test } from "bun:test";
import {
	DictionaryQueryPlanner,
	type DictionaryStorageTopology,
} from "../src/adapters/storage/sql/dict-planner";

const topology = (
	connectionId: string,
	filterConnectionId = connectionId,
): DictionaryStorageTopology => ({
	concepts: {
		domain: "concepts",
		backendKind: "sql",
		connectionId,
		tenantId: "tenant-a",
		dialect: "postgres",
	},
	expressions: {
		domain: "expressions",
		backendKind: "sql",
		connectionId,
		tenantId: "tenant-a",
		dialect: "postgres",
	},
	filters: {
		domain: "filters",
		backendKind: "sql",
		connectionId: filterConnectionId,
		tenantId: "tenant-a",
		dialect: "postgres",
	},
});

describe("dictionary topology planner", () => {
	test("uses one PostgreSQL join when all domains share a connection", () => {
		const plan = new DictionaryQueryPlanner().plan(topology("pg-main"), {
			lookupPrefix: "short",
			roleName: "subjective.qualifier",
		});
		expect(plan.kind).toBe("sql_join_all");
		expect(plan.joinGroup).toEqual(["expressions", "concepts", "filters"]);
		expect(plan.followUpDomains).toEqual([]);
		expect(plan.statements[0]?.sql).toContain('JOIN "dict_concepts"');
	});

	test("uses an expression/concept pair join with filter follow-up", () => {
		const plan = new DictionaryQueryPlanner().plan(
			topology("pg-main", "pg-filter"),
			{
				lookupTerm: "shortness of breath",
				roleName: "subjective.qualifier",
			},
		);
		expect(plan.kind).toBe("sql_join_pair");
		expect(plan.joinGroup).toEqual(["expressions", "concepts"]);
		expect(plan.followUpDomains).toEqual(["filters"]);
		expect(plan.statements[0]?.sql).not.toContain("concept_filters");
	});

	test("uses bounded hydration when SQL stores are separate", () => {
		const separate: DictionaryStorageTopology = {
			concepts: {
				domain: "concepts",
				backendKind: "sql",
				connectionId: "pg-concept",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
			expressions: {
				domain: "expressions",
				backendKind: "sql",
				connectionId: "pg-expression",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
			filters: {
				domain: "filters",
				backendKind: "sql",
				connectionId: "pg-filter",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
		};
		const plan = new DictionaryQueryPlanner().plan(separate, {
			lookupPrefix: "short",
			roleName: "subjective.qualifier",
		});
		expect(plan.kind).toBe("bounded_hydration");
		expect(plan.followUpDomains).toEqual(["concepts", "filters"]);
		expect(plan.statements[0]?.sql).not.toContain("JOIN");
	});

	test("uses an expression/filter pair join when concepts are separate", () => {
		const plan = new DictionaryQueryPlanner().plan(
			{
				concepts: {
					domain: "concepts",
					backendKind: "sql",
					connectionId: "pg-concept",
					tenantId: "tenant-a",
					dialect: "postgres",
				},
				expressions: {
					domain: "expressions",
					backendKind: "sql",
					connectionId: "pg-main",
					tenantId: "tenant-a",
					dialect: "postgres",
				},
				filters: {
					domain: "filters",
					backendKind: "sql",
					connectionId: "pg-main",
					tenantId: "tenant-a",
					dialect: "postgres",
				},
			},
			{
				lookupPrefix: "short",
				roleName: "subjective.qualifier",
			},
		);
		expect(plan.kind).toBe("sql_join_pair");
		expect(plan.joinGroup).toEqual(["expressions", "filters"]);
		expect(plan.followUpDomains).toEqual(["concepts"]);
		expect(plan.statements[0]?.sql).not.toContain('JOIN "dict_concepts"');
	});
});
