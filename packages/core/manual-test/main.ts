import type { KvBackend, SimpleKvBackend } from "../src/browser";
import {
	IndexedDbKvBackend,
	LocalStorageKvBackend,
	MemoryKvBackend,
	OpfsDb,
	SimpleIndexedDbKvBackend,
	SimpleLocalStorageKvBackend,
	SimpleMemoryKvBackend,
} from "../src/browser";

const logElement = document.querySelector<HTMLPreElement>("#log")!;
const fixture = `core-manual-${location.host || "local"}`;

function log(message: string): void {
	logElement.textContent += `${message}\n`;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function json(value: unknown): string {
	return JSON.stringify(value);
}

async function testGeneric(
	name: string,
	backend: KvBackend,
	persistent: boolean,
): Promise<void> {
	const key = `${fixture}-sentinel`;
	const value = { kind: name, count: 1 };
	await backend.set(key, value);
	await backend.set(`${key}-temporary`, { temporary: true });
	assert(
		json((await backend.load())[key]) === json(value),
		"set/load mismatch",
	);
	await backend.set(key, { ...value, count: 2 });
	assert((await backend.load())[key] !== undefined, "update missing");
	await backend.delete(`${key}-temporary`);
	await backend.save();
	if (persistent) {
		const second =
			name === "generic-localstorage"
				? new LocalStorageKvBackend({ prefix: `${fixture}:generic:` })
				: new IndexedDbKvBackend({
						dbName: `${fixture}-generic`,
						storeName: "kv",
					});
		assert(
			(await second.load())[key] !== undefined,
			"persistent value missing in new instance",
		);
	}
	await backend.delete(key);
	assert(
		(await backend.load())[key] === undefined,
		"delete did not remove value",
	);
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const value of values) result.push(value);
	return result;
}

async function testSimple(
	name: string,
	backend: SimpleKvBackend,
	persistent: boolean,
): Promise<void> {
	const session = `${fixture}-session`;
	const id = `${fixture}-state`;
	const user = { level: "user" as const, userId: fixture };
	const global = { level: "global" as const };
	await backend.load();
	await backend.setSessionState(session, id, { name, count: 1 });
	assert(
		(await backend.getSessionState(session, id))?.name === name,
		"session get mismatch",
	);
	assert(
		(await backend.listSessionIds(session)).includes(id),
		"session list mismatch",
	);
	assert(
		(await collect(backend.scanSessionStates(session))).length > 0,
		"session scan empty",
	);
	await backend.setPersistentState(id, user, { owner: fixture });
	await backend.setPersistentState(`${id}-global`, global, { owner: "global" });
	assert(
		(await backend.getPersistentState(id, user))?.owner === fixture,
		"user state mismatch",
	);
	assert(
		(await backend.getPersistentState(`${id}-global`, global))?.owner ===
			"global",
		"global state mismatch",
	);
	await backend.setAlias(session, "latest", id);
	assert(
		(await backend.getAlias(session, "latest")) === id,
		"alias get mismatch",
	);
	assert(
		(await backend.listAliases(session)).some(
			(entry) => entry.alias === "latest",
		),
		"alias list mismatch",
	);
	await backend.save();
	if (persistent) await backend.load();
	await backend.deleteAlias(session, "latest");
	await backend.deleteSessionState(session, id);
	await backend.deletePersistentState(id, user);
	assert(
		(await backend.getSessionState(session, id)) === null,
		"session delete mismatch",
	);
	assert(
		(await backend.getPersistentState(id, user)) === null,
		"persistent delete mismatch",
	);
}

async function testOpfs(): Promise<void> {
	const table = `core_manual_${crypto.randomUUID().replaceAll("-", "")}`;
	const db = new OpfsDb(
		`file:/core-manual/${fixture}.sqlite3`,
		"./sqlite3-worker1.mjs",
	);
	try {
		await db.open();
		await db.exec(
			`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, value TEXT)`,
		);
		await db.exec(`INSERT INTO "${table}" (value) VALUES (?)`, ["one"]);
		await db.exec(`INSERT INTO "${table}" (value) VALUES (?)`, ["two"]);
		assert(
			(await db.query(`SELECT value FROM "${table}" ORDER BY id`)).length === 2,
			"query row count mismatch",
		);
		assert(
			(
				await db.get<{ value: string }>(
					`SELECT value FROM "${table}" WHERE id = ?`,
					[1],
				)
			)?.value === "one",
			"get mismatch",
		);
		try {
			await db.exec("BEGIN");
			await db.exec(`DELETE FROM "${table}" WHERE id = ?`, [1]);
			throw new Error("rollback probe");
		} catch (error) {
			await db.exec("ROLLBACK");
			assert(
				error instanceof Error && error.message === "rollback probe",
				"unexpected rollback result",
			);
		}
		assert(
			(await db.query(`SELECT id FROM "${table}"`)).length === 2,
			"rollback did not restore row",
		);
		await db.exec(`DROP TABLE "${table}"`);
	} finally {
		await db.close();
	}
}

const tests: Record<string, () => Promise<void>> = {
	"generic-memory": () =>
		testGeneric("generic-memory", new MemoryKvBackend(), false),
	"generic-localstorage": () =>
		testGeneric(
			"generic-localstorage",
			new LocalStorageKvBackend({ prefix: `${fixture}:generic:` }),
			true,
		),
	"generic-indexeddb": () =>
		testGeneric(
			"generic-indexeddb",
			new IndexedDbKvBackend({ dbName: `${fixture}-generic`, storeName: "kv" }),
			true,
		),
	"simple-memory": () =>
		testSimple("simple-memory", new SimpleMemoryKvBackend(), false),
	"simple-localstorage": () =>
		testSimple(
			"simple-localstorage",
			new SimpleLocalStorageKvBackend(`${fixture}:simple:`),
			true,
		),
	"simple-indexeddb": () =>
		testSimple(
			"simple-indexeddb",
			new SimpleIndexedDbKvBackend(`${fixture}-simple`),
			true,
		),
	opfs: testOpfs,
};

async function run(name: string): Promise<void> {
	const started = performance.now();
	try {
		await tests[name]!();
		log(`PASS ${name} (${Math.round(performance.now() - started)} ms)`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`FAIL ${name}: ${message}`);
	}
}

document.querySelector("#run-all")!.addEventListener("click", async () => {
	log(
		`Runtime: localStorage=${typeof localStorage !== "undefined"}, indexedDB=${typeof indexedDB !== "undefined"}, Worker=${typeof Worker !== "undefined"}`,
	);
	for (const name of Object.keys(tests)) await run(name);
});
document.querySelector("#clear")!.addEventListener("click", () => {
	logElement.textContent = "";
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
	"[data-test]",
)) {
	button.addEventListener("click", () => void run(button.dataset.test!));
}
