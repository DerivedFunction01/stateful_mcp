import type {
	KvBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { UserMacroProfile } from "../../contracts/extension-config";

export interface WorkspaceSettings {
	readonly activeProfile?: string;
	readonly defaultProfile?: string;
	readonly theme?: string;
	readonly density?: string;
	readonly enabledExtensions?: readonly string[];
	readonly [key: string]: unknown;
}

export interface SettingsStorageDriver {
	loadSettings(): Promise<WorkspaceSettings>;
	saveSettings(settings: WorkspaceSettings): Promise<void>;
	loadProfile(id: string): Promise<UserMacroProfile | null>;
	saveProfile(id: string, delta: Partial<UserMacroProfile>): Promise<void>;
	listProfiles(): Promise<readonly string[]>;
	deleteProfile(id: string): Promise<void>;
	loadExtensionConfig(id: string): Promise<Record<string, unknown> | null>;
	saveExtensionConfig(id: string, config: Record<string, unknown>): Promise<void>;
	listExtensionConfigs(): Promise<readonly string[]>;
}

export class CoreKvSettingsStorageDriver implements SettingsStorageDriver {
	private static readonly SETTINGS_KEY = "macro:settings:workspace";
	private static readonly PROFILE_PREFIX = "macro:profile:";
	private static readonly EXTENSION_PREFIX = "macro:extension:";

	constructor(private readonly kv: KvBackend) {}

	async loadSettings(): Promise<WorkspaceSettings> {
		const all = await this.kv.load();
		const val = all[CoreKvSettingsStorageDriver.SETTINGS_KEY];
		if (val && typeof val === "object") {
			return val as WorkspaceSettings;
		}
		return {};
	}

	async saveSettings(settings: WorkspaceSettings): Promise<void> {
		await this.kv.set(CoreKvSettingsStorageDriver.SETTINGS_KEY, settings);
		await this.kv.save();
	}

	async loadProfile(id: string): Promise<UserMacroProfile | null> {
		const all = await this.kv.load();
		const key = `${CoreKvSettingsStorageDriver.PROFILE_PREFIX}${id}`;
		const val = all[key];
		if (val && typeof val === "object") {
			return val as UserMacroProfile;
		}
		return null;
	}

	async saveProfile(
		id: string,
		delta: Partial<UserMacroProfile>,
	): Promise<void> {
		const key = `${CoreKvSettingsStorageDriver.PROFILE_PREFIX}${id}`;
		await this.kv.set(key, { ...delta, id });
		await this.kv.save();
	}

	async listProfiles(): Promise<readonly string[]> {
		const all = await this.kv.load();
		const prefix = CoreKvSettingsStorageDriver.PROFILE_PREFIX;
		const ids: string[] = [];
		for (const key of Object.keys(all)) {
			if (key.startsWith(prefix)) {
				ids.push(key.slice(prefix.length));
			}
		}
		return Object.freeze(ids.sort());
	}

	async deleteProfile(id: string): Promise<void> {
		const key = `${CoreKvSettingsStorageDriver.PROFILE_PREFIX}${id}`;
		await this.kv.delete(key);
		await this.kv.save();
	}

	async loadExtensionConfig(
		id: string,
	): Promise<Record<string, unknown> | null> {
		const all = await this.kv.load();
		const key = `${CoreKvSettingsStorageDriver.EXTENSION_PREFIX}${id}`;
		const val = all[key];
		if (val && typeof val === "object") {
			return val as Record<string, unknown>;
		}
		return null;
	}

	async saveExtensionConfig(
		id: string,
		config: Record<string, unknown>,
	): Promise<void> {
		const key = `${CoreKvSettingsStorageDriver.EXTENSION_PREFIX}${id}`;
		await this.kv.set(key, config);
		await this.kv.save();
	}

	async listExtensionConfigs(): Promise<readonly string[]> {
		const all = await this.kv.load();
		const prefix = CoreKvSettingsStorageDriver.EXTENSION_PREFIX;
		const ids: string[] = [];
		for (const key of Object.keys(all)) {
			if (key.startsWith(prefix)) {
				ids.push(key.slice(prefix.length));
			}
		}
		return Object.freeze(ids.sort());
	}
}

export class CoreSqlSettingsStorageDriver implements SettingsStorageDriver {
	private initialized = false;

	constructor(private readonly sql: SqlExecutor) {}

	private async ensureTables(): Promise<void> {
		if (this.initialized) return;
		await this.sql.exec(`
			CREATE TABLE IF NOT EXISTS macro_workspace_settings (
				key TEXT PRIMARY KEY,
				data TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
		await this.sql.exec(`
			CREATE TABLE IF NOT EXISTS macro_profiles (
				id TEXT PRIMARY KEY,
				extends_id TEXT,
				data TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
		await this.sql.exec(`
			CREATE TABLE IF NOT EXISTS macro_extensions (
				id TEXT PRIMARY KEY,
				data TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
		this.initialized = true;
	}

	async loadSettings(): Promise<WorkspaceSettings> {
		await this.ensureTables();
		const row = await this.sql.queryOne(
			"SELECT data FROM macro_workspace_settings WHERE key = ?",
			["workspace"],
		);
		if (row && typeof row.data === "string") {
			try {
				return JSON.parse(row.data) as WorkspaceSettings;
			} catch {
				return {};
			}
		}
		return {};
	}

	async saveSettings(settings: WorkspaceSettings): Promise<void> {
		await this.ensureTables();
		const json = JSON.stringify(settings);
		const now = Date.now();
		await this.sql.exec(
			"INSERT INTO macro_workspace_settings (key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
			["workspace", json, now],
		);
	}

	async loadProfile(id: string): Promise<UserMacroProfile | null> {
		await this.ensureTables();
		const row = await this.sql.queryOne(
			"SELECT data FROM macro_profiles WHERE id = ?",
			[id],
		);
		if (row && typeof row.data === "string") {
			try {
				return JSON.parse(row.data) as UserMacroProfile;
			} catch {
				return null;
			}
		}
		return null;
	}

	async saveProfile(
		id: string,
		delta: Partial<UserMacroProfile>,
	): Promise<void> {
		await this.ensureTables();
		const extendsId = (delta as any).extends ?? null;
		const json = JSON.stringify({ ...delta, id });
		const now = Date.now();
		await this.sql.exec(
			"INSERT INTO macro_profiles (id, extends_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET extends_id = excluded.extends_id, data = excluded.data, updated_at = excluded.updated_at",
			[id, extendsId, json, now],
		);
	}

	async listProfiles(): Promise<readonly string[]> {
		await this.ensureTables();
		const rows = await this.sql.query("SELECT id FROM macro_profiles ORDER BY id ASC");
		return Object.freeze(rows.map((r) => r.id as string));
	}

	async deleteProfile(id: string): Promise<void> {
		await this.ensureTables();
		await this.sql.exec("DELETE FROM macro_profiles WHERE id = ?", [id]);
	}

	async loadExtensionConfig(
		id: string,
	): Promise<Record<string, unknown> | null> {
		await this.ensureTables();
		const row = await this.sql.queryOne(
			"SELECT data FROM macro_extensions WHERE id = ?",
			[id],
		);
		if (row && typeof row.data === "string") {
			try {
				return JSON.parse(row.data) as Record<string, unknown>;
			} catch {
				return null;
			}
		}
		return null;
	}

	async saveExtensionConfig(
		id: string,
		config: Record<string, unknown>,
	): Promise<void> {
		await this.ensureTables();
		const json = JSON.stringify(config);
		const now = Date.now();
		await this.sql.exec(
			"INSERT INTO macro_extensions (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
			[id, json, now],
		);
	}

	async listExtensionConfigs(): Promise<readonly string[]> {
		await this.ensureTables();
		const rows = await this.sql.query("SELECT id FROM macro_extensions ORDER BY id ASC");
		return Object.freeze(rows.map((r) => r.id as string));
	}
}
