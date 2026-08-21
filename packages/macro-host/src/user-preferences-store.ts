import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { JsonlKvBackend } from "@stateful-mcp/core";
import type {
	UserPreferencesDto,
	UserPreferencesExportBundleDto,
} from "@stateful-mcp/macro-protocol";

export const DEFAULT_SERVER_USER_PREFERENCES: UserPreferencesDto = {
	keymapProfile: "default",
	vimEnabled: false,
	theme: "dark",
	locale: "en",
	autoPurgeOnExecute: false,
	inspectorPosition: "right",
	inspectorWidth: 320,
	customKeybindings: [],
};

export const USER_PREFERENCES_KV_KEY = "macro.user.preferences.v1";

export function resolveUserPreferencesPath(customPath?: string): string {
	if (customPath && customPath.trim()) {
		return resolve(customPath.trim());
	}
	const envPath =
		process.env.MACRO_USER_PREFERENCES_PATH ??
		process.env.MACRO_USER_PREFS_PATH;
	if (envPath && envPath.trim()) {
		return resolve(envPath.trim());
	}
	return resolve(homedir(), ".config", "macro", "preferences.jsonl");
}

export interface ServerUserPreferencesStoreOptions {
	readonly dataFilePath?: string;
	readonly maxWalEntries?: number;
	readonly maxWalBytes?: number;
}

export class ServerUserPreferencesStore {
	private readonly dataFilePath: string;
	private readonly backend: JsonlKvBackend;
	private cached: UserPreferencesDto | null = null;

	constructor(options: ServerUserPreferencesStoreOptions = {}) {
		this.dataFilePath = resolveUserPreferencesPath(options.dataFilePath);
		this.backend = new JsonlKvBackend({
			dataFilePath: this.dataFilePath,
			maxWalEntries: options.maxWalEntries ?? 50,
			maxWalBytes: options.maxWalBytes ?? 1024 * 1024,
		});
	}

	getDataFilePath(): string {
		return this.dataFilePath;
	}

	private async ensureDirectory(): Promise<void> {
		try {
			await mkdir(dirname(this.dataFilePath), { recursive: true });
		} catch {
			// Directory might already exist
		}
	}

	async loadPreferences(): Promise<UserPreferencesDto> {
		if (this.cached) return this.cached;
		await this.ensureDirectory();
		try {
			const data = await this.backend.load();
			const stored = data[USER_PREFERENCES_KV_KEY] as
				| Partial<UserPreferencesDto>
				| undefined;
			if (stored) {
				this.cached = {
					...DEFAULT_SERVER_USER_PREFERENCES,
					...stored,
					keymapProfile:
						stored.keymapProfile ||
						DEFAULT_SERVER_USER_PREFERENCES.keymapProfile,
					theme: stored.theme || DEFAULT_SERVER_USER_PREFERENCES.theme,
					locale: stored.locale || DEFAULT_SERVER_USER_PREFERENCES.locale,
					vimEnabled: Boolean(stored.vimEnabled),
					autoPurgeOnExecute: Boolean(stored.autoPurgeOnExecute),
					inspectorPosition:
						stored.inspectorPosition === "left" ? "left" : "right",
					inspectorWidth:
						typeof stored.inspectorWidth === "number" &&
						stored.inspectorWidth >= 160
							? stored.inspectorWidth
							: DEFAULT_SERVER_USER_PREFERENCES.inspectorWidth,
					customKeybindings: Array.isArray(stored.customKeybindings)
						? stored.customKeybindings
						: DEFAULT_SERVER_USER_PREFERENCES.customKeybindings,
				};
			} else {
				this.cached = { ...DEFAULT_SERVER_USER_PREFERENCES };
			}
			return this.cached;
		} catch {
			this.cached = { ...DEFAULT_SERVER_USER_PREFERENCES };
			return this.cached;
		}
	}

	async savePreferences(
		partial: Partial<UserPreferencesDto>,
	): Promise<UserPreferencesDto> {
		const current = await this.loadPreferences();
		const next: UserPreferencesDto = {
			...current,
			...partial,
			keymapProfile:
				partial.keymapProfile ||
				current.keymapProfile ||
				DEFAULT_SERVER_USER_PREFERENCES.keymapProfile,
			theme:
				partial.theme || current.theme || DEFAULT_SERVER_USER_PREFERENCES.theme,
			locale:
				partial.locale ||
				current.locale ||
				DEFAULT_SERVER_USER_PREFERENCES.locale,
			vimEnabled:
				partial.vimEnabled !== undefined
					? Boolean(partial.vimEnabled)
					: current.vimEnabled,
			autoPurgeOnExecute:
				partial.autoPurgeOnExecute !== undefined
					? Boolean(partial.autoPurgeOnExecute)
					: current.autoPurgeOnExecute,
			inspectorPosition:
				partial.inspectorPosition === "left" ? "left" : "right",
			inspectorWidth:
				typeof partial.inspectorWidth === "number" &&
				partial.inspectorWidth >= 160
					? partial.inspectorWidth
					: current.inspectorWidth,
			customKeybindings: Array.isArray(partial.customKeybindings)
				? partial.customKeybindings
				: current.customKeybindings,
		};
		this.cached = next;
		await this.ensureDirectory();
		await this.backend.set(USER_PREFERENCES_KV_KEY, next);
		await this.backend.save();
		return next;
	}

	async exportBundle(): Promise<UserPreferencesExportBundleDto> {
		const prefs = await this.loadPreferences();
		return {
			schemaVersion: 1,
			exportedAt: new Date().toISOString(),
			preferences: prefs,
			metadata: {
				backendKind: "jsonl",
				dataFilePath: this.dataFilePath,
				generator: "@stateful-mcp/macro-host",
			},
		};
	}

	async importBundle(
		bundle: UserPreferencesExportBundleDto,
	): Promise<UserPreferencesDto> {
		if (!bundle || typeof bundle !== "object" || !bundle.preferences) {
			throw new Error("Invalid preferences bundle: missing preferences data");
		}
		return this.savePreferences(bundle.preferences);
	}
}
