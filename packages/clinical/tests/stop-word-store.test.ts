import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { StopWordProfile } from "../src/store/interfaces";
import { DefaultStopWordStore } from "../src/store/reference/stop-words/default-stop-word-store";
import { KvStopWordProfileStore } from "../src/store/reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../src/store/reference/stop-words/kv-stop-word-word-list-store";
import { SqlStopWordProfileStore } from "../src/store/reference/stop-words/sql-stop-word-profile-store";
import { SqlStopWordWordListStore } from "../src/store/reference/stop-words/sql-stop-word-word-list-store";
import { StopWordCompiler } from "../src/store/reference/stop-words/stop-word-compiler";
import type { StopWordWordListStore } from "../src/store/reference/stop-words/word-list-store-interfaces";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKvWordListStore(): StopWordWordListStore {
	const backend = new MemoryKvBackend();
	return new KvStopWordWordListStore(backend);
}

function makeKvProfileStore(): KvStopWordProfileStore {
	const backend = new MemoryKvBackend();
	return new KvStopWordProfileStore(backend);
}

async function makeSqlPair(): Promise<{
	wordListStore: StopWordWordListStore;
	profileStore: ReturnType<typeof SqlStopWordProfileStore>;
}> {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	const executor = new SqlExecutor(backend);
	const wordListStore = new SqlStopWordWordListStore("sqlite", executor);
	const profileStore = new SqlStopWordProfileStore("sqlite", executor);
	return { wordListStore, profileStore };
}

// ── StopWordWordListStore KV ──────────────────────────────────────────────────

describe("KvStopWordWordListStore", () => {
	const store = makeKvWordListStore();

	it("set/get roundtrip", async () => {
		await store.set("id_glob", ["a", "an", "the"]);
		expect(await store.get("id_glob")).toEqual(["a", "an", "the"]);
	});

	it("get returns null for missing id", async () => {
		expect(await store.get("id_nope")).toBeNull();
	});

	it("list returns all rows", async () => {
		await store.set("id_a", ["x"]);
		await store.set("id_b", ["y", "z"]);
		const list = await store.list();
		expect(list).toHaveLength(3);
		expect(list.find((r) => r.id === "id_a")?.words).toEqual(["x"]);
	});

	it("delete removes row", async () => {
		await store.set("id_tmp", ["del"]);
		await store.delete("id_tmp");
		expect(await store.get("id_tmp")).toBeNull();
	});

	it("overwrite replaces words", async () => {
		await store.set("id_glob", ["a", "an"]);
		await store.set("id_glob", ["the", "a"]);
		expect(await store.get("id_glob")).toEqual(["the", "a"]);
	});
});

// ── StopWordWordListStore SQL ─────────────────────────────────────────────────

describe("SqlStopWordWordListStore", () => {
	let store: StopWordWordListStore;

	it("set/get roundtrip", async () => {
		const { wordListStore } = await makeSqlPair();
		store = wordListStore;
		await store.set("id_glob", ["a", "an", "the"]);
		expect(await store.get("id_glob")).toEqual(["a", "an", "the"]);
	});

	it("list returns all rows after multiple sets", async () => {
		await store.set("id_a", ["x"]);
		await store.set("id_b", ["y", "z"]);
		const list = await store.list();
		expect(list).toHaveLength(3);
		expect(list.find((r) => r.id === "id_a")?.words).toEqual(["x"]);
	});

	it("delete removes row", async () => {
		await store.set("id_tmp", ["del"]);
		await store.delete("id_tmp");
		expect(await store.get("id_tmp")).toBeNull();
	});
});

// ── StopWordProfile KV roundtrip ──────────────────────────────────────────────

describe("KvStopWordProfileStore (extended fields)", () => {
	const store = makeKvProfileStore();

	it("persists and loads new fields", async () => {
		const profile: StopWordProfile = {
			profileId: "prof_1",
			personnelId: "user123",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["urgent"],
			wordListIds: ["id_glob", "id_user123"],
			excludedWords: ["urgent"],
			additionalWords: ["stat"],
		};
		await store.set(profile);
		const loaded = await store.get("prof_1");
		expect(loaded).toEqual(profile);
	});
});

// ── StopWordCompiler ──────────────────────────────────────────────────────────

describe("StopWordCompiler", () => {
	const wordLists: StopWordWordListStore = makeKvWordListStore();
	const profiles: KvStopWordProfileStore = makeKvProfileStore();
	const compiler = new StopWordCompiler(profiles, wordLists);

	beforeEach(async () => {
		await wordLists.set("id_glob", ["the", "a", "an", "is", "with"]);
		await wordLists.set("id_billing", ["cost", "fee"]);
		await wordLists.set("id_user1", ["with", "patient"]);
	});

	it("returns empty set for unknown personnel", async () => {
		expect(
			await compiler.compileForContext({ personnelId: "unknown" }),
		).toEqual(new Set());
	});

	it("union of referenced lists minus excluded plus additional", async () => {
		await profiles.set({
			profileId: "prof1",
			personnelId: "user1",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["urgent"],
			wordListIds: ["id_glob", "id_billing"],
			excludedWords: ["the", "cost"],
			additionalWords: ["priority"],
		});

		const result = await compiler.compileForContext({ personnelId: "user1" });
		expect(result.has("the")).toBe(false);
		expect(result.has("cost")).toBe(false);
		expect(result.has("priority")).toBe(true);
		expect(result.has("urgent")).toBe(true);
		expect(result.has("with")).toBe(true); // from id_glob
		expect(result.has("fee")).toBe(true); // from id_billing
	});

	it("all fields are lowercased", async () => {
		await profiles.set({
			profileId: "prof2",
			personnelId: "user2",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["URGENT"],
			wordListIds: ["id_user1"],
			excludedWords: ["PATIENT"],
			additionalWords: ["STAT"],
		});

		const result = await compiler.compileForContext({ personnelId: "user2" });
		expect(result.has("urgent")).toBe(true);
		expect(result.has("patient")).toBe(false);
		expect(result.has("stat")).toBe(true);
		expect(result.has("with")).toBe(true); // from id_user1
		expect(result.has("WITH")).toBe(false);
	});
});

// ── DefaultStopWordStore end-to-end ──────────────────────────────────────────

describe("DefaultStopWordStore", () => {
	it("KV: profile + word lists compile through store interface", async () => {
		const wordLists = makeKvWordListStore();
		const profiles = makeKvProfileStore();
		const store = new DefaultStopWordStore(profiles, wordLists);

		await wordLists.set("id_glob", ["the", "a", "is"]);
		await profiles.set({
			profileId: "prof_e2e",
			personnelId: "doc1",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["urgent"],
			wordListIds: ["id_glob"],
			excludedWords: ["the"],
			additionalWords: [],
		});

		const set = await store.compileStopWordsForContext({
			personnelId: "doc1",
		});
		expect(set.has("the")).toBe(false);
		expect(set.has("a")).toBe(true);
		expect(set.has("is")).toBe(true);
		expect(set.has("urgent")).toBe(true);
	});

	it("SQL: profile + word lists compile through store interface", async () => {
		const { wordListStore, profileStore } = await makeSqlPair();
		const store = new DefaultStopWordStore(profileStore, wordListStore);

		await wordListStore.set("id_glob", ["the", "a", "is"]);
		await profileStore.set({
			profileId: "prof_sql",
			personnelId: "doc2",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["stat"],
			wordListIds: ["id_glob"],
			excludedWords: ["a"],
			additionalWords: ["priority"],
		});

		const set = await store.compileStopWordsForContext({
			personnelId: "doc2",
		});
		expect(set.has("a")).toBe(false);
		expect(set.has("the")).toBe(true);
		expect(set.has("stat")).toBe(true);
		expect(set.has("priority")).toBe(true);
	});
});

// ── Backward / edge cases ─────────────────────────────────────────────────────

describe("StopWordStore edge cases", () => {
	it("empty profile compiles to empty set", async () => {
		const compiler = new StopWordCompiler(
			makeKvProfileStore(),
			makeKvWordListStore(),
		);
		const result = await compiler.compileForContext({ personnelId: "ghost" });
		expect(result.size).toBe(0);
	});

	it("missing referenced word list is silently skipped", async () => {
		const wordLists = makeKvWordListStore();
		const profiles = makeKvProfileStore();
		const compiler = new StopWordCompiler(profiles, wordLists);

		await profiles.set({
			profileId: "p3",
			personnelId: "u3",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["only"],
			wordListIds: ["id_does_not_exist"],
			excludedWords: [],
			additionalWords: [],
		});

		const result = await compiler.compileForContext({ personnelId: "u3" });
		expect(result.size).toBe(1);
		expect(result.has("only")).toBe(true);
	});
});
