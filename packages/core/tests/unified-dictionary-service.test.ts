import { describe, expect, test } from "bun:test";
import { createRepo } from "../src/adapters/storage/shared/unified-repo";

describe("unified repository dictionary service", () => {
	test("wires the dictionary façade over configured concept and expression stores", async () => {
		const repo = await createRepo({
			concept: { type: "memory" },
			expression: { type: "memory" },
		});
		expect(repo.dictionaryStore).toBeDefined();
		await repo.dictionaryStore!.loadConfig({
			concepts: [
				{
					id: "c1",
					namespaceCode: "TEST",
					standardCode: "C1",
					display: "Example",
					active: true,
				},
			],
			expressions: [
				{
					id: "e1",
					term: "example",
					regexPattern: "example",
					isCaseInsensitive: true,
					conceptId: "c1",
					priorityWeight: 1,
					active: true,
				},
			],
		});
		const result = await repo.dictionaryStore!.resolve("example", {
			level: "global",
		});
		expect(result.status).toBe("FOUND");
		expect(result.results[0]?.conceptId).toBe("c1");
	});

	test("wires a topology planner from dictionary storage runtime routes", async () => {
		const repo = await createRepo({
			storageRuntime: {
				dictionary: {
					concepts: {
						source: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: "hospital.db" },
							},
							role: "source",
						},
					},
					expressions: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: "local.db" },
							},
							role: "projection",
						},
					},
					filters: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: "local.db" },
							},
							role: "projection",
						},
					},
				},
			},
		});
		expect(repo.dictionaryQueryPlanner).toBeDefined();
		expect(repo.dictionarySqlQueryRunner).toBeDefined();
		expect(repo.dictionarySqlQueryRunners?.concepts).toBeDefined();
		expect(repo.dictionarySqlQueryRunners?.expressions).toBeDefined();
		expect(repo.dictionaryStorageTopology?.concepts.backendKind).toBe("sql");
		expect(repo.dictionaryStorageTopology?.expressions.connectionId).toBe(
			"local.db",
		);
	});

	test("uses the local expression/filter SQL path and hydrates authoritative concepts", async () => {
		const base = `/tmp/dictionary-integration-${Date.now()}`;
		const repo = await createRepo({
			storageRuntime: {
				dictionary: {
					concepts: {
						source: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-concepts.db` },
							},
							role: "source",
						},
					},
					expressions: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-local.db` },
							},
							role: "projection",
						},
					},
					filters: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-local.db` },
							},
							role: "projection",
						},
					},
				},
			},
		});
		await repo.dictionaryStore!.loadConfig({
			concepts: [
				{
					id: "c1",
					namespaceCode: "TEST",
					standardCode: "C1",
					display: "Example",
					active: true,
				},
			],
			expressions: [
				{
					id: "e1",
					term: "example",
					regexPattern: "example",
					isCaseInsensitive: true,
					conceptId: "c1",
					priorityWeight: 2,
					active: true,
				},
			],
		});
		const result = await repo.dictionaryStore!.resolve("example", {
			role_name: "role",
		});
		expect(result.status).toBe("FOUND");
		expect(result.results[0]?.conceptId).toBe("c1");
		await repo.conceptFilterStore!.set({
			filterId: "deny-c1",
			conceptId: "c1",
			policy: "blacklist",
			roleName: "role",
		});
		const denied = await repo.dictionaryStore!.resolve("example", {
			role_name: "role",
		});
		expect(denied.status).toBe("NOT_FOUND");
	});

	test("revalidates optimized SQL candidates with the expression regex", async () => {
		const base = `/tmp/dictionary-regex-${Date.now()}`;
		const repo = await createRepo({
			storageRuntime: {
				dictionary: {
					concepts: {
						source: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-concepts.db` },
							},
							role: "source",
						},
					},
					expressions: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-local.db` },
							},
							role: "projection",
						},
					},
					filters: {
						projection: {
							locator: {
								_type: "adapter",
								name: "sqlite",
								options: { path: `${base}-local.db` },
							},
							role: "projection",
						},
					},
				},
			},
		});
		await repo.dictionaryStore!.loadConfig({
			concepts: [
				{
					id: "c1",
					namespaceCode: "TEST",
					standardCode: "C1",
					display: "Example",
					active: true,
				},
			],
			expressions: [
				{
					id: "e1",
					term: "example",
					lookupTerm: "example",
					regexPattern: "^not-example$",
					isCaseInsensitive: true,
					conceptId: "c1",
					priorityWeight: 1,
					active: true,
				},
			],
		});
		const result = await repo.dictionaryStore!.resolve("example");
		expect(result.status).toBe("NOT_FOUND");
	});

	test("constructs a persistent KV concept-filter store from dictionary routes", async () => {
		const repo = await createRepo({
			storageRuntime: {
				dictionary: {
					filters: {
						projection: {
							locator: { _type: "adapter", name: "memory" },
							role: "projection",
						},
					},
				},
			},
		});
		expect(repo.conceptFilterStore).toBeDefined();
		await repo.conceptFilterStore!.set({
			filterId: "f1",
			conceptId: "c1",
			policy: "blacklist",
			roleName: "role",
		});
		expect(
			await repo.conceptFilterStore!.listForConceptRole("c1", "role"),
		).toHaveLength(1);
	});
});
