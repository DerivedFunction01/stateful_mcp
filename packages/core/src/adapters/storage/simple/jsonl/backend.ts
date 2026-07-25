import * as fs from "fs/promises";
import type { OwnerScope } from "../../../../config/types";
import type { KvBackend } from "../kv-backend";
import { persistentKey } from "../kv-backend";
import { JsonlWal } from "./shared";

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
	private dirtySessionStates = new Set<string>();
	private deletedSessionStates = new Set<string>();
	private dirtyPersistentStates = new Set<string>();
	private deletedPersistentStates = new Set<string>();
	private dirtyAliases = new Set<string>();
	private deletedAliases = new Set<string>();

	private sessionWal?: JsonlWal;
	private persistentWal?: JsonlWal;

	constructor(
		private sessionFilePath?: string,
		private persistentFilePath?: string,
		walOptions?: { maxWalEntries?: number; maxWalBytes?: number },
	) {
		if (this.sessionFilePath) {
			this.sessionWal = new JsonlWal(this.sessionFilePath, walOptions);
		}
		if (this.persistentFilePath) {
			this.persistentWal = new JsonlWal(
				this.persistentFilePath,
				walOptions,
			);
		}
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

		const dataExists = await this.fileOrDirExists(this.sessionFilePath);
		const walExists = this.sessionWal
			? await this.fileOrDirExists(this.sessionWal.walPath)
			: false;

		if (dataExists) {
			try {
				const raw = await fs.readFile(this.sessionFilePath, "utf-8");
				for (const line of raw.split("\n")) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.sessionStates.set(entry.id, {
							value: entry.data,
							sessionId: entry.sessionId || "",
						});
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(
							`${entry.sessionId}:${entry.alias}`,
						);
					}
				}
			} catch (err: any) {
				if (err.code !== "ENOENT") throw err;
			}
		}

		if (walExists && this.sessionWal) {
			for await (const entry of this.sessionWal.replay() as any) {
				if (entry.operation === "set") {
					if (entry.type === "session_state") {
						this.sessionStates.set(entry.id, {
							value: entry.data.value,
							sessionId: entry.data.sessionId,
						});
					} else if (entry.type === "alias") {
						this.aliases.set(entry.id, entry.data.targetId);
					}
				} else if (entry.operation === "delete") {
					if (entry.type === "session_state") {
						this.sessionStates.delete(entry.id);
					} else if (entry.type === "alias") {
						this.aliases.delete(entry.id);
					}
				}
			}
		}
	}

	private async loadPersistent(): Promise<void> {
		if (!this.persistentFilePath) return;

		const dataExists = await this.fileOrDirExists(
			this.persistentFilePath,
		);
		const walExists = this.persistentWal
			? await this.fileOrDirExists(this.persistentWal.walPath)
			: false;

		if (dataExists) {
			try {
				const raw = await fs.readFile(
					this.persistentFilePath,
					"utf-8",
				);
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
			} catch (err: any) {
				if (err.code !== "ENOENT") throw err;
			}
		}

		if (walExists && this.persistentWal) {
			for await (const entry of this.persistentWal.replay() as any) {
				if (
					entry.operation === "set" &&
					entry.type === "persistent_state"
				) {
					this.persistentStates.set(entry.id, {
						value: entry.data.value,
						scope: entry.data.scope,
					});
				} else if (
					entry.operation === "delete" &&
					entry.type === "persistent_state"
				) {
					this.persistentStates.delete(entry.id);
				}
			}
		}
	}

	private async saveSessions(): Promise<void> {
		if (!this.sessionFilePath || !this.sessionWal) return;

		for (const id of this.dirtySessionStates) {
			const entry = this.sessionStates.get(id);
			if (entry) {
				await this.sessionWal.append({
					operation: "set",
					type: "session_state",
					id,
					data: {
						sessionId: entry.sessionId,
						value: entry.value,
					},
				});
			}
		}
		for (const id of this.deletedSessionStates) {
			await this.sessionWal.append({
				operation: "delete",
				type: "session_state",
				id,
			});
		}
		for (const key of this.dirtyAliases) {
			const targetId = this.aliases.get(key);
			if (targetId !== undefined) {
				await this.sessionWal.append({
					operation: "set",
					type: "alias",
					id: key,
					data: { targetId },
				});
			}
		}
		for (const id of this.deletedAliases) {
			await this.sessionWal.append({
				operation: "delete",
				type: "alias",
				id,
			});
		}

		if (this.sessionWal.exceedsThresholds()) {
			await this.compactSessions();
		}

		this.dirtySessionStates.clear();
		this.deletedSessionStates.clear();
		this.dirtyAliases.clear();
		this.deletedAliases.clear();
	}

	private async savePersistent(): Promise<void> {
		if (!this.persistentFilePath || !this.persistentWal) return;

		for (const id of this.dirtyPersistentStates) {
			const entry = this.persistentStates.get(id);
			if (entry) {
				await this.persistentWal.append({
					operation: "set",
					type: "persistent_state",
					id,
					data: { scope: entry.scope, value: entry.value },
				});
			}
		}
		for (const id of this.deletedPersistentStates) {
			await this.persistentWal.append({
				operation: "delete",
				type: "persistent_state",
				id,
			});
		}

		if (this.persistentWal.exceedsThresholds()) {
			await this.compactPersistent();
		}

		this.dirtyPersistentStates.clear();
		this.deletedPersistentStates.clear();
	}

	async compact(): Promise<void> {
		await this.compactSessions();
		await this.compactPersistent();
	}

	private async compactSessions(): Promise<void> {
		if (!this.sessionFilePath || !this.sessionWal) return;
		const lines: string[] = [];
		for (const [id, { value, sessionId }] of this.sessionStates.entries()) {
			lines.push(
				JSON.stringify({ type: "state", id, sessionId, data: value }),
			);
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
		await this.sessionWal.reconcile(lines);
	}

	private async compactPersistent(): Promise<void> {
		if (!this.persistentFilePath || !this.persistentWal) return;
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
		await this.persistentWal.reconcile(lines);
	}

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		const found = this.sessionStates.get(id);
		return Promise.resolve(found?.value ?? null);
	}

	async setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		this.sessionStates.set(id, { value, sessionId });
		this.dirtySessionStates.add(id);
		await this.save();
	}

	async deleteSessionState(sessionId: string, id: string): Promise<void> {
		this.sessionStates.delete(id);
		this.deletedSessionStates.add(id);
		await this.save();
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
				if (entry.scope.level === "global")
					return Promise.resolve(entry.value);
				if (scope.level === "user" && entry.scope?.userId === scope.userId)
					return Promise.resolve(entry.value);
			}
		}
		return Promise.resolve(null);
	}

	async setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		this.persistentStates.set(id, { value, scope });
		this.dirtyPersistentStates.add(id);
		await this.save();
	}

	async deletePersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<void> {
		this.deletedPersistentStates.add(persistentKey(id, scope));
		this.persistentStates.delete(persistentKey(id, scope));
		await this.save();
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>> {
		for (const entry of this.persistentStates.values()) {
			if (entry.scope.level === "global") {
				if (includeGlobal !== false) yield entry.value;
			} else if (scope.level === "user") {
				if (entry.scope?.userId === scope.userId) yield entry.value;
			}
		}
	}

	getAlias(sessionId: string, alias: string): Promise<string | null> {
		return Promise.resolve(
			this.aliases.get(`${sessionId}:${alias}`) ?? null,
		);
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.aliases.set(`${sessionId}:${alias}`, targetId);
		this.dirtyAliases.add(`${sessionId}:${alias}`);
		await this.save();
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(`${sessionId}:${alias}`);
		this.deletedAliases.add(`${sessionId}:${alias}`);
		await this.save();
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
