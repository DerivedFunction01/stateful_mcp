import * as fs from "fs/promises";
import * as path from "path";
import type { OwnerScope } from "../../../config/types";

export interface KvBackend {
	load(): Promise<void>;
	save(): Promise<void>;

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null>;
	setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void>;
	deleteSessionState(sessionId: string, id: string): Promise<void>;
	listSessionIds(sessionId: string): Promise<string[]>;
	scanSessionStates(sessionId: string): AsyncIterable<Record<string, any>>;

	getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null>;
	setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void>;
	deletePersistentState(id: string, scope: OwnerScope): Promise<void>;
	scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>>;

	getAlias(sessionId: string, alias: string): Promise<string | null>;
	setAlias(sessionId: string, alias: string, targetId: string): Promise<void>;
	deleteAlias(sessionId: string, alias: string): Promise<void>;
	listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>>;
}

const sessionKey = (sessionId: string, id: string) => `${sessionId}:${id}`;
const sessionPrefix = (sessionId: string) => `${sessionId}:`;
const aliasKey = (sessionId: string, alias: string) => `${sessionId}:${alias}`;
const aliasPrefix = (sessionId: string) => `${sessionId}:`;
const persistentKey = (id: string, scope: OwnerScope) => {
	const scopeId = scope.level === "user" ? scope.userId : "global";
	return `${scope.level}:${scopeId}:${id}`;
};
const persistentPrefix = (scope: OwnerScope, includeGlobal?: boolean) => {
	if (scope.level === "global") return "global:global:";
	if (includeGlobal) return null;
	return `user:${scope.userId}:`;
};

export class MemoryKvBackend implements KvBackend {
	private sessionStates = new Map<string, Record<string, any>>();
	private persistentStates = new Map<string, Record<string, any>>();
	private aliases = new Map<string, string>();

	load(): Promise<void> {
		return Promise.resolve();
	}

	save(): Promise<void> {
		return Promise.resolve();
	}

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		return Promise.resolve(
			this.sessionStates.get(sessionKey(sessionId, id)) ?? null,
		);
	}

	setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		this.sessionStates.set(sessionKey(sessionId, id), value);
		return Promise.resolve();
	}

	deleteSessionState(sessionId: string, id: string): Promise<void> {
		this.sessionStates.delete(sessionKey(sessionId, id));
		return Promise.resolve();
	}

	async listSessionIds(sessionId: string): Promise<string[]> {
		const prefix = sessionPrefix(sessionId);
		const ids: string[] = [];
		for (const key of this.sessionStates.keys()) {
			if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
		}
		return ids;
	}

	async *scanSessionStates(
		sessionId: string,
	): AsyncIterable<Record<string, any>> {
		const prefix = sessionPrefix(sessionId);
		for (const [key, val] of this.sessionStates.entries()) {
			if (key.startsWith(prefix)) yield val;
		}
	}

	getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null> {
		return Promise.resolve(
			this.persistentStates.get(persistentKey(id, scope)) ?? null,
		);
	}

	setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		this.persistentStates.set(persistentKey(id, scope), value);
		return Promise.resolve();
	}

	deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		this.persistentStates.delete(persistentKey(id, scope));
		return Promise.resolve();
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>> {
		const prefix = persistentPrefix(scope, includeGlobal);
		const globalPrefix = "global:global:";

		for (const [key, val] of this.persistentStates.entries()) {
			if (prefix && key.startsWith(prefix)) {
				yield val;
			} else if (
				includeGlobal &&
				scope.level === "user" &&
				key.startsWith(globalPrefix)
			) {
				yield val;
			} else if (scope.level === "global" && key.startsWith(globalPrefix)) {
				yield val;
			}
		}
	}

	getAlias(sessionId: string, alias: string): Promise<string | null> {
		return Promise.resolve(
			this.aliases.get(aliasKey(sessionId, alias)) ?? null,
		);
	}

	setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		this.aliases.set(aliasKey(sessionId, alias), targetId);
		return Promise.resolve();
	}

	deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(aliasKey(sessionId, alias));
		return Promise.resolve();
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = aliasPrefix(sessionId);
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}
}

export class JsonlKvBackend implements KvBackend {
	private sessionStates = new Map<
		string,
		{ value: Record<string, any>; sessionId: string }
	>();
	private persistentStates = new Map<
		string,
		{ value: Record<string, any>; scope: OwnerScope }
	>();
	private aliases = new Map<string, string>();

	constructor(
		private sessionFilePath?: string,
		private persistentFilePath?: string,
	) {}

	private async ensureDir(filePath: string): Promise<void> {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
	}

	private async fileOrDirExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	async load(): Promise<void> {
		await this.loadSessions();
		await this.loadPersistent();
	}

	async save(): Promise<void> {
		await this.saveSessions();
		await this.savePersistent();
	}

	private async loadSessions(): Promise<void> {
		if (!this.sessionFilePath) return;
		try {
			if (await this.fileOrDirExists(this.sessionFilePath)) {
				const raw = await fs.readFile(this.sessionFilePath, "utf-8");
				for (const line of raw.split("\n")) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.sessionStates.set(
							entry.data[
								Object.keys(entry.data).find((k) => k.endsWith("Id")) || "id"
							],
							{
								value: entry.data,
								sessionId: entry.sessionId || "",
							},
						);
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(`${entry.sessionId}:${entry.alias}`);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
	}

	private async loadPersistent(): Promise<void> {
		if (!this.persistentFilePath) return;
		try {
			if (await this.fileOrDirExists(this.persistentFilePath)) {
				const raw = await fs.readFile(this.persistentFilePath, "utf-8");
				for (const line of raw.split("\n")) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "persistent_state") {
						this.persistentStates.set(entry.id, {
							value: entry.data,
							scope: entry.data.scope || { level: "global" },
						});
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
	}

	private async saveSessions(): Promise<void> {
		if (!this.sessionFilePath) return;
		const lines: string[] = [];
		for (const [id, { value, sessionId }] of this.sessionStates.entries()) {
			lines.push(JSON.stringify({ type: "state", sessionId, data: value }));
		}
		for (const [key, targetId] of this.aliases.entries()) {
			const colon = key.indexOf(":");
			lines.push(
				JSON.stringify({
					type: "alias",
					sessionId: key.slice(0, colon),
					alias: key.slice(colon + 1),
					targetId,
				}),
			);
		}
		await this.truncateAndWrite(this.sessionFilePath, lines);
	}

	private async savePersistent(): Promise<void> {
		if (!this.persistentFilePath) return;
		const lines: string[] = [];
		for (const [id, { value, scope }] of this.persistentStates.entries()) {
			lines.push(
				JSON.stringify({
					type: "persistent_state",
					id,
					data: { ...value, scope },
				}),
			);
		}
		await this.truncateAndWrite(this.persistentFilePath, lines);
	}

	private async truncateAndWrite(
		filePath: string,
		lines: string[],
	): Promise<void> {
		await this.ensureDir(filePath);
		await fs.writeFile(
			filePath,
			lines.join("\n") + (lines.length > 0 ? "\n" : ""),
			"utf-8",
		);
	}

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		const found = this.sessionStates.get(id);
		return Promise.resolve(found?.value ?? null);
	}

	setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		this.sessionStates.set(id, { value, sessionId });
		return Promise.resolve();
	}

	deleteSessionState(sessionId: string, id: string): Promise<void> {
		this.sessionStates.delete(id);
		return Promise.resolve();
	}

	async listSessionIds(sessionId: string): Promise<string[]> {
		return Array.from(this.sessionStates.values())
			.filter((v) => v.sessionId === sessionId)
			.map((v) => {
				const state = v.value;
				return String(
					state[
						Object.keys(state).find((k) => k.endsWith("Id")) ||
							Object.keys(state)[0]!
					],
				);
			});
	}

	async *scanSessionStates(
		sessionId: string,
	): AsyncIterable<Record<string, any>> {
		for (const { value, sessionId: sid } of this.sessionStates.values()) {
			if (sid === sessionId) yield value;
		}
	}

	getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null> {
		for (const [key, entry] of this.persistentStates.entries()) {
			if (key === id) {
				if (entry.scope.level === "global") return Promise.resolve(entry.value);
				if (scope.level === "user" && entry.scope?.userId === scope.userId)
					return Promise.resolve(entry.value);
			}
		}
		return Promise.resolve(null);
	}

	setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		this.persistentStates.set(id, { value, scope });
		return Promise.resolve();
	}

	deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		this.persistentStates.delete(id);
		return Promise.resolve();
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>> {
		for (const entry of this.persistentStates.values()) {
			if (entry.scope.level === "global") {
				yield entry.value;
			} else if (scope.level === "user") {
				if (entry.scope?.userId === scope.userId) yield entry.value;
				if (includeGlobal) {
					/* already yielded above */
				}
			}
		}
	}

	getAlias(sessionId: string, alias: string): Promise<string | null> {
		return Promise.resolve(this.aliases.get(`${sessionId}:${alias}`) ?? null);
	}

	setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		this.aliases.set(`${sessionId}:${alias}`, targetId);
		return Promise.resolve();
	}

	deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(`${sessionId}:${alias}`);
		return Promise.resolve();
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}
}
