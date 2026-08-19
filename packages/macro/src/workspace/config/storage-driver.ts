import type { KvBackend } from "../../../../core/src/adapters/storage/generic/kv/KvBackend";
import type { SqlExecutor } from "../../../../core/src/adapters/storage/generic/SqlExecutor";
import type { UserMacroProfile } from "../../contracts/extension-config";

export interface WorkspaceSettings {
	readonly activeProfile?: string;
	readonly defaultProfile?: string;
	readonly uiLocale?: string;
	readonly theme?: string;
	readonly density?: string;
	readonly enabledExtensions?: readonly string[];
	readonly [key: string]: unknown;
}

export interface SettingsBundleRecord {
	readonly settings: WorkspaceSettings;
	readonly profiles: Readonly<Record<string, UserMacroProfile>>;
	readonly extensions: Readonly<Record<string, Record<string, unknown>>>;
	readonly revision: string;
}

export interface SettingsStorageDriver {
	loadSettings(): Promise<WorkspaceSettings>;
	saveSettings(settings: WorkspaceSettings): Promise<void>;
	loadProfile(id: string): Promise<UserMacroProfile | null>;
	saveProfile(id: string, delta: Partial<UserMacroProfile>): Promise<void>;
	listProfiles(): Promise<readonly string[]>;
	deleteProfile(id: string): Promise<void>;
	loadExtensionConfig(id: string): Promise<Record<string, unknown> | null>;
	saveExtensionConfig(
		id: string,
		config: Record<string, unknown>,
	): Promise<void>;
	listExtensionConfigs(): Promise<readonly string[]>;
	replaceBundle?(bundle: SettingsBundleRecord): Promise<void>;
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

	async replaceBundle(bundle: SettingsBundleRecord): Promise<void> {
		const all = await this.kv.load();
		const profilePrefix = CoreKvSettingsStorageDriver.PROFILE_PREFIX;
		const extensionPrefix = CoreKvSettingsStorageDriver.EXTENSION_PREFIX;
		for (const key of Object.keys(all)) {
			if (
				(key.startsWith(profilePrefix) &&
					!Object.hasOwn(bundle.profiles, key.slice(profilePrefix.length))) ||
				(key.startsWith(extensionPrefix) &&
					!Object.hasOwn(bundle.extensions, key.slice(extensionPrefix.length)))
			) {
				await this.kv.delete(key);
			}
		}
		await this.kv.set(CoreKvSettingsStorageDriver.SETTINGS_KEY, bundle.settings);
		for (const [id, profile] of Object.entries(bundle.profiles)) {
			await this.kv.set(`${profilePrefix}${id}`, { ...profile, id });
		}
		for (const [id, config] of Object.entries(bundle.extensions)) {
			await this.kv.set(`${extensionPrefix}${id}`, config);
		}
		await this.kv.set("macro:settings:bundle", bundle);
		await this.kv.save();
	}
}

export class CoreSqlSettingsStorageDriver implements SettingsStorageDriver {
	private initialized = false;

	constructor(private readonly sql: SqlExecutor) {}

	private async ensureTables(): Promise<void> {
		if (this.initialized) return;
		const compiler = this.sql.compiler;
		const tables = [
			compiler.compileCreateTable({
				table: "macro_workspace_settings",
				ifNotExists: true,
				columns: [
					{ name: "key", type: "text", primaryKey: true },
					{ name: "data", type: "json", nullable: false },
					{ name: "updated_at", type: "int", nullable: false },
				],
			}),
			compiler.compileCreateTable({
				table: "macro_settings_bundle",
				ifNotExists: true,
				columns: [
					{ name: "id", type: "text", primaryKey: true },
					{ name: "data", type: "json", nullable: false },
					{ name: "revision", type: "text", nullable: false },
					{ name: "updated_at", type: "int", nullable: false },
				],
			}),
			compiler.compileCreateTable({
				table: "macro_profiles",
				ifNotExists: true,
				columns: [
					{ name: "id", type: "text", primaryKey: true },
					{ name: "extends_id", type: "text", nullable: true },
					{ name: "data", type: "json", nullable: false },
					{ name: "updated_at", type: "int", nullable: false },
				],
			}),
			compiler.compileCreateTable({
				table: "macro_extensions",
				ifNotExists: true,
				columns: [
					{ name: "id", type: "text", primaryKey: true },
					{ name: "data", type: "json", nullable: false },
					{ name: "updated_at", type: "int", nullable: false },
				],
			}),
		];
		for (const table of tables) await this.sql.exec(table.sql, table.params);
		this.initialized = true;
	}

	async loadSettings(): Promise<WorkspaceSettings> {
		await this.ensureTables();
		const query = this.sql.compiler.compileSelect({
			table: "macro_workspace_settings",
			select: [{ column: "data" }],
			where: [{ column: "key", op: "eq", value: "workspace" }],
			limit: 1,
		});
		const row = await this.sql.queryOne(query.sql, query.params);
		if (row && row.data && typeof row.data === "object") {
			return row.data as WorkspaceSettings;
		}
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
		const query = this.sql.compiler.compileReplace({
			table: "macro_workspace_settings",
			values: {
				key: "workspace",
				data: JSON.stringify(settings),
				updated_at: Date.now(),
			},
			conflictColumns: ["key"],
		});
		await this.sql.exec(query.sql, query.params);
	}

	async loadProfile(id: string): Promise<UserMacroProfile | null> {
		await this.ensureTables();
		const query = this.sql.compiler.compileSelect({
			table: "macro_profiles",
			select: [{ column: "data" }],
			where: [{ column: "id", op: "eq", value: id }],
			limit: 1,
		});
		const row = await this.sql.queryOne(query.sql, query.params);
		if (row && row.data && typeof row.data === "object") {
			return row.data as UserMacroProfile;
		}
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
		const query = this.sql.compiler.compileReplace({
			table: "macro_profiles",
			values: {
				id,
				extends_id: extendsId,
				data: JSON.stringify({ ...delta, id }),
				updated_at: Date.now(),
			},
			conflictColumns: ["id"],
		});
		await this.sql.exec(query.sql, query.params);
	}

	async listProfiles(): Promise<readonly string[]> {
		await this.ensureTables();
		const query = this.sql.compiler.compileSelect({
			table: "macro_profiles",
			select: [{ column: "id" }],
			orderBy: [{ column: "id", direction: "ASC" }],
		});
		const rows = await this.sql.query(query.sql, query.params);
		return Object.freeze(
			rows.map((r: { readonly id?: unknown }) => r.id as string),
		);
	}

	async deleteProfile(id: string): Promise<void> {
		await this.ensureTables();
		const query = this.sql.compiler.compileDelete({
			table: "macro_profiles",
			where: [{ column: "id", op: "eq", value: id }],
		});
		await this.sql.exec(query.sql, query.params);
	}

	async loadExtensionConfig(
		id: string,
	): Promise<Record<string, unknown> | null> {
		await this.ensureTables();
		const query = this.sql.compiler.compileSelect({
			table: "macro_extensions",
			select: [{ column: "data" }],
			where: [{ column: "id", op: "eq", value: id }],
			limit: 1,
		});
		const row = await this.sql.queryOne(query.sql, query.params);
		if (row && row.data && typeof row.data === "object") {
			return row.data as Record<string, unknown>;
		}
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
		const query = this.sql.compiler.compileReplace({
			table: "macro_extensions",
			values: { id, data: JSON.stringify(config), updated_at: Date.now() },
			conflictColumns: ["id"],
		});
		await this.sql.exec(query.sql, query.params);
	}

	async listExtensionConfigs(): Promise<readonly string[]> {
		await this.ensureTables();
		const query = this.sql.compiler.compileSelect({
			table: "macro_extensions",
			select: [{ column: "id" }],
			orderBy: [{ column: "id", direction: "ASC" }],
		});
		const rows = await this.sql.query(query.sql, query.params);
		return Object.freeze(
			rows.map((r: { readonly id?: unknown }) => r.id as string),
		);
	}

	async replaceBundle(bundle: SettingsBundleRecord): Promise<void> {
		await this.ensureTables();
		const compiler = this.sql.compiler;
		const statements: Array<{ sql: string; params: any[] }> = [];
		statements.push(
			compiler.compileReplace({
				table: "macro_workspace_settings",
				values: {
					key: "workspace",
					data: JSON.stringify(bundle.settings),
					updated_at: Date.now(),
				},
				conflictColumns: ["key"],
			}),
		);
		const profileIds = Object.keys(bundle.profiles);
		const extensionIds = Object.keys(bundle.extensions);
		for (const id of await this.listProfiles()) {
			if (!profileIds.includes(id)) {
				statements.push(
					compiler.compileDelete({
						table: "macro_profiles",
						where: [{ column: "id", op: "eq", value: id }],
					}),
				);
			}
		}
		for (const id of await this.listExtensionConfigs()) {
			if (!extensionIds.includes(id)) {
				statements.push(
					compiler.compileDelete({
						table: "macro_extensions",
						where: [{ column: "id", op: "eq", value: id }],
					}),
				);
			}
		}
		for (const [id, profile] of Object.entries(bundle.profiles)) {
			statements.push(
				compiler.compileReplace({
					table: "macro_profiles",
					values: {
						id,
						extends_id: (profile as any).extends ?? null,
						data: JSON.stringify({ ...profile, id }),
						updated_at: Date.now(),
					},
					conflictColumns: ["id"],
				}),
			);
		}
		for (const [id, config] of Object.entries(bundle.extensions)) {
			statements.push(
				compiler.compileReplace({
					table: "macro_extensions",
					values: { id, data: JSON.stringify(config), updated_at: Date.now() },
					conflictColumns: ["id"],
				}),
			);
		}
		statements.push(
			compiler.compileReplace({
				table: "macro_settings_bundle",
				values: {
					id: "bundle",
					data: JSON.stringify(bundle),
					revision: bundle.revision,
					updated_at: Date.now(),
				},
				conflictColumns: ["id"],
			}),
		);
		await this.sql.transaction(statements);
	}
}
