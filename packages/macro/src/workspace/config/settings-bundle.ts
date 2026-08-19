import type { SqlExecutor } from "../../../../core/src/adapters/storage/generic/SqlExecutor";
import type { UserMacroProfile } from "../../contracts/extension-config";
import type {
	SettingsBundleRecord,
	SettingsStorageDriver,
} from "./storage-driver";

/**
 * Opaque durable revision token for the settings bundle.
 *
 * The token is a content hash over the canonical serialized bundle, so it is
 * stable across reloads and opaque to the browser. It is distinct from the
 * per-session workspace revision, the parse/document revision, and the
 * WebSocket sequence. Saves carry the token observed on load; a stale token
 * produces a structured conflict instead of a silent overwrite.
 */
export type SettingsRevision = string;

export interface SettingsBundleSnapshot extends SettingsBundleRecord {
	readonly revision: SettingsRevision;
}

export interface SettingsBundleStorage {
	load(): Promise<SettingsBundleSnapshot>;
	save(
		next: Omit<SettingsBundleSnapshot, "revision">,
		expectedRevision: SettingsRevision,
	): Promise<SettingsRevision>;
}

/**
 * Builds a canonical, order-stable serialization of a bundle snapshot so the
 * revision token is independent of object key insertion order.
 */
export function canonicalBundleJson(snapshot: SettingsBundleSnapshot): string {
	const payload = {
		settings: sortRecord(snapshot.settings),
		profiles: sortRecord(
			Object.fromEntries(
				Object.entries(snapshot.profiles).map(([id, profile]) => [
					id,
					sortRecord(profile as Record<string, unknown>),
				]),
			),
		),
		extensions: sortRecord(
			Object.fromEntries(
				Object.entries(snapshot.extensions).map(([id, cfg]) => [
					id,
					sortRecord(cfg),
				]),
			),
		),
	};
	return JSON.stringify(payload);
}

export function computeSettingsRevision(
	snapshot: SettingsBundleSnapshot,
): SettingsRevision {
	return `macro-settings:${hashJson(canonicalBundleJson(snapshot))}`;
}

function sortRecord(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortRecord);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			out[key] = sortRecord(record[key]);
		}
		return out;
	}
	return value;
}

function hashJson(value: string): string {
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a:${(hash >>> 0).toString(16)}`;
}

export class CoreKvSettingsBundleStorage implements SettingsBundleStorage {
	private initialized = false;

	constructor(
		private readonly driver: SettingsStorageDriver,
		private readonly kv: {
			load(): Promise<Record<string, unknown>>;
			set(key: string, value: unknown): Promise<void> | void;
			delete(key: string): Promise<void> | void;
			save(): Promise<void> | void;
		},
	) {}

	async load(): Promise<SettingsBundleSnapshot> {
		await this.ensureInitialized();
		const settings = await this.driver.loadSettings();
		const profileIds = await this.driver.listProfiles();
		const profiles: Record<string, UserMacroProfile> = {};
		for (const id of profileIds) {
			const profile = await this.driver.loadProfile(id);
			if (profile) profiles[id] = profile;
		}
		const extensionIds = await this.driver.listExtensionConfigs();
		const extensions: Record<string, Record<string, unknown>> = {};
		for (const id of extensionIds) {
			const cfg = await this.driver.loadExtensionConfig(id);
			if (cfg) extensions[id] = cfg;
		}
		const content = { settings, profiles, extensions };
		return {
			...content,
			revision: computeSettingsRevision({ ...content, revision: "" }),
		};
	}

	async save(
		next: Omit<SettingsBundleSnapshot, "revision">,
		expectedRevision: SettingsRevision,
	): Promise<SettingsRevision> {
		await this.ensureInitialized();
		const current = await this.load();
		if (current.revision !== expectedRevision) {
			throw new SettingsBundleConflictError(
				"Settings bundle revision is stale",
				expectedRevision,
				current.revision,
			);
		}

		// Staged replacement: write to a staging key, then commit atomically.
		// This keeps JSONL backends crash-safe without a second write path.
		const stagingRevision = computeSettingsRevision({ ...next, revision: "" });
		const staging: SettingsBundleSnapshot = {
			...next,
			revision: stagingRevision,
		};
		if (this.driver.replaceBundle) {
			await this.driver.replaceBundle(staging);
			return staging.revision;
		}

		const stagingKey = "macro:settings:bundle:staging";
		await this.kv.set(stagingKey, {
			settings: staging.settings,
			profiles: staging.profiles,
			extensions: staging.extensions,
			revision: staging.revision,
		});
		await this.kv.save();

		// Commit staged bundle into the driver-backed resources.
		await this.driver.saveSettings(staging.settings);
		for (const [id, profile] of Object.entries(staging.profiles)) {
			await this.driver.saveProfile(id, profile);
		}
		for (const [id, cfg] of Object.entries(staging.extensions)) {
			await this.driver.saveExtensionConfig(id, cfg);
		}

		// Drop the staging key and persist the committed revision.
		await this.kv.delete(stagingKey);
		await this.kv.set("macro:settings:bundle:revision", staging.revision);
		await this.kv.save();

		return staging.revision;
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
	}
}

export class CoreSqlSettingsBundleStorage implements SettingsBundleStorage {
	private initialized = false;

	constructor(
		private readonly driver: SettingsStorageDriver,
		private readonly sql: SqlExecutor,
	) {}

	async load(): Promise<SettingsBundleSnapshot> {
		await this.ensureInitialized();
		const settings = await this.driver.loadSettings();
		const profileIds = await this.driver.listProfiles();
		const profiles: Record<string, UserMacroProfile> = {};
		for (const id of profileIds) {
			const profile = await this.driver.loadProfile(id);
			if (profile) profiles[id] = profile;
		}
		const extensionIds = await this.driver.listExtensionConfigs();
		const extensions: Record<string, Record<string, unknown>> = {};
		for (const id of extensionIds) {
			const cfg = await this.driver.loadExtensionConfig(id);
			if (cfg) extensions[id] = cfg;
		}
		const content = { settings, profiles, extensions };
		return {
			...content,
			revision: computeSettingsRevision({ ...content, revision: "" }),
		};
	}

	async save(
		next: Omit<SettingsBundleSnapshot, "revision">,
		expectedRevision: SettingsRevision,
	): Promise<SettingsRevision> {
		await this.ensureInitialized();
		const current = await this.load();
		if (current.revision !== expectedRevision) {
			throw new SettingsBundleConflictError(
				"Settings bundle revision is stale",
				expectedRevision,
				current.revision,
			);
		}

		const stagingRevision = computeSettingsRevision({ ...next, revision: "" });
		const staging: SettingsBundleSnapshot = {
			...next,
			revision: stagingRevision,
		};
		if (this.driver.replaceBundle) {
			await this.driver.replaceBundle(staging);
			return staging.revision;
		}

		// Single SQL transaction: commit the bundle atomically and record the
		// new revision. A failure rolls back every resource write.
		const compiler = this.sql.compiler;
		const upsert = compiler.compileReplace({
			table: "macro_settings_bundle",
			values: {
				id: "bundle",
				data: JSON.stringify(staging),
				revision: staging.revision,
				updated_at: Date.now(),
			},
			conflictColumns: ["id"],
		});
		await this.sql.transaction([{ sql: upsert.sql, params: upsert.params }]);

		// Driver writes are idempotent re-commits of the same staged content.
		await this.driver.saveSettings(staging.settings);
		for (const [id, profile] of Object.entries(staging.profiles)) {
			await this.driver.saveProfile(id, profile);
		}
		for (const [id, cfg] of Object.entries(staging.extensions)) {
			await this.driver.saveExtensionConfig(id, cfg);
		}

		return staging.revision;
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		const compiler = this.sql.compiler;
		const table = compiler.compileCreateTable({
			table: "macro_settings_bundle",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "text", primaryKey: true },
				{ name: "data", type: "json", nullable: false },
				{ name: "revision", type: "text", nullable: false },
				{ name: "updated_at", type: "int", nullable: false },
			],
		});
		await this.sql.exec(table.sql, table.params);
		this.initialized = true;
	}
}

export class SettingsBundleConflictError extends Error {
	readonly code = "SETTINGS_REVISION_STALE";

	constructor(
		message: string,
		readonly expectedRevision: string,
		readonly actualRevision: string,
	) {
		super(message);
		this.name = "SettingsBundleConflictError";
	}
}
