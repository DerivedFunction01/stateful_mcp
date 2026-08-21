import {
	IndexedDbKvBackend,
	type KvBackend,
	LocalStorageKvBackend,
	MemoryKvBackend,
} from "@stateful-mcp/core/browser";
import type {
	StorageBackendKind,
	UserPreferencesDto,
	UserPreferencesExportBundleDto,
} from "@stateful-mcp/macro-protocol";

export const USER_PREFERENCES_STORAGE_KEY = "macro.user.preferences.v1";

export const DEFAULT_USER_PREFERENCES: UserPreferencesDto = {
	keymapProfile: "default",
	vimEnabled: false,
	theme: "dark",
	locale: "en",
	autoPurgeOnExecute: false,
	inspectorPosition: "right",
	inspectorWidth: 320,
	customKeybindings: [],
};

function safeGetLocalStorage(): Storage | null {
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage;
		}
		if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
			return (globalThis as any).localStorage as Storage;
		}
	} catch {
		// Ignore storage access permissions error
	}
	return null;
}

export function sanitizeUserPreferences(
	raw: Partial<UserPreferencesDto> | null | undefined,
): UserPreferencesDto {
	if (!raw) return { ...DEFAULT_USER_PREFERENCES };
	return {
		...DEFAULT_USER_PREFERENCES,
		...raw,
		keymapProfile: raw.keymapProfile || DEFAULT_USER_PREFERENCES.keymapProfile,
		theme: raw.theme || DEFAULT_USER_PREFERENCES.theme,
		locale: raw.locale || DEFAULT_USER_PREFERENCES.locale,
		vimEnabled: Boolean(raw.vimEnabled),
		autoPurgeOnExecute: Boolean(raw.autoPurgeOnExecute),
		inspectorPosition: raw.inspectorPosition === "left" ? "left" : "right",
		inspectorWidth:
			typeof raw.inspectorWidth === "number" && raw.inspectorWidth >= 160
				? raw.inspectorWidth
				: DEFAULT_USER_PREFERENCES.inspectorWidth,
		customKeybindings: Array.isArray(raw.customKeybindings)
			? raw.customKeybindings
			: DEFAULT_USER_PREFERENCES.customKeybindings,
	};
}

export class UserPreferencesRepository {
	private backend: KvBackend;
	private backendKind: StorageBackendKind;
	private memoryCache: UserPreferencesDto;
	private readonly listeners = new Set<(prefs: UserPreferencesDto) => void>();
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	constructor(
		backend?: KvBackend,
		kind: StorageBackendKind = "indexeddb",
		initialPreferences?: UserPreferencesDto,
	) {
		this.backendKind = kind;
		this.memoryCache = initialPreferences
			? sanitizeUserPreferences(initialPreferences)
			: { ...DEFAULT_USER_PREFERENCES };

		if (backend) {
			this.backend = backend;
		} else {
			this.backend = this.createDefaultBackend(kind);
		}

		// Initial synchronous hydration from legacy localStorage fallback if available
		this.hydrateFromLegacyLocalStorage();
	}

	private createDefaultBackend(kind: StorageBackendKind): KvBackend {
		if (kind === "indexeddb" && typeof indexedDB !== "undefined") {
			try {
				return new IndexedDbKvBackend({
					dbName: "macro-workbench-v1",
					storeName: "preferences",
				});
			} catch {
				// Fallback to localstorage
			}
		}

		if (kind === "localstorage" || typeof localStorage !== "undefined") {
			try {
				return new LocalStorageKvBackend({ prefix: "macro:storage:" });
			} catch {
				// Fallback to memory
			}
		}

		return new MemoryKvBackend();
	}

	private hydrateFromLegacyLocalStorage(): void {
		const storage = safeGetLocalStorage();
		if (!storage) return;
		try {
			const raw = storage.getItem(USER_PREFERENCES_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				this.memoryCache = sanitizeUserPreferences(parsed);
			}
		} catch {
			// Ignore parse errors
		}
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				const data = await this.backend.load();
				const stored = data[USER_PREFERENCES_STORAGE_KEY] as
					| Partial<UserPreferencesDto>
					| undefined;

				if (stored) {
					this.memoryCache = sanitizeUserPreferences(stored);
				} else {
					// 1-Time Auto-migration from legacy localStorage into active KvBackend
					const legacyStorage = safeGetLocalStorage();
					if (legacyStorage) {
						const raw = legacyStorage.getItem(USER_PREFERENCES_STORAGE_KEY);
						if (raw) {
							const parsed = JSON.parse(raw);
							this.memoryCache = sanitizeUserPreferences(parsed);
							await this.backend.set(
								USER_PREFERENCES_STORAGE_KEY,
								this.memoryCache,
							);
							await this.backend.save();
						}
					}
				}
			} catch (e) {
				console.warn("Failed to initialize user preferences backend:", e);
			} finally {
				this.initialized = true;
				this.notifyListeners();
			}
		})();

		return this.initPromise;
	}

	load(): UserPreferencesDto {
		return this.memoryCache;
	}

	save(partial: Partial<UserPreferencesDto>): UserPreferencesDto {
		const next = sanitizeUserPreferences({
			...this.memoryCache,
			...partial,
		});
		this.memoryCache = next;

		// Persist synchronously to localStorage legacy mirror for resilience
		const legacyStorage = safeGetLocalStorage();
		if (legacyStorage) {
			try {
				legacyStorage.setItem(
					USER_PREFERENCES_STORAGE_KEY,
					JSON.stringify(next),
				);
			} catch {
				// Ignore quota errors
			}
		}

		// Asynchronously persist to active KvBackend
		void (async () => {
			try {
				await this.backend.set(USER_PREFERENCES_STORAGE_KEY, next);
				await this.backend.save();
			} catch (e) {
				console.warn("Failed to persist preferences to KvBackend:", e);
			}
		})();

		this.notifyListeners();
		return next;
	}

	reset(): UserPreferencesDto {
		return this.save(DEFAULT_USER_PREFERENCES);
	}

	subscribe(listener: (prefs: UserPreferencesDto) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) {
			try {
				listener(this.memoryCache);
			} catch (e) {
				console.error("Error in user preferences subscriber:", e);
			}
		}
	}

	getBackendKind(): StorageBackendKind {
		return this.backendKind;
	}

	async exportBundle(): Promise<UserPreferencesExportBundleDto> {
		return {
			schemaVersion: 1,
			exportedAt: new Date().toISOString(),
			preferences: this.load(),
			metadata: {
				backendKind: this.backendKind,
				generator: "@stateful-mcp/macro-web",
			},
		};
	}

	async importBundle(
		bundle: UserPreferencesExportBundleDto,
	): Promise<UserPreferencesDto> {
		if (!bundle || typeof bundle !== "object" || !bundle.preferences) {
			throw new Error("Invalid preferences bundle: missing preferences data");
		}
		return this.save(bundle.preferences);
	}

	async migrateBackend(targetKind: StorageBackendKind): Promise<void> {
		if (targetKind === this.backendKind) return;
		const targetBackend = this.createDefaultBackend(targetKind);

		// Transfer data to target backend
		await targetBackend.set(USER_PREFERENCES_STORAGE_KEY, this.memoryCache);
		await targetBackend.save();

		this.backend = targetBackend;
		this.backendKind = targetKind;
	}
}

// Global Singleton Repository
let globalRepository: UserPreferencesRepository =
	new UserPreferencesRepository();

export function getUserPreferencesRepository(): UserPreferencesRepository {
	return globalRepository;
}

export function setUserPreferencesRepository(
	repo: UserPreferencesRepository,
): void {
	globalRepository = repo;
}

export function loadUserPreferences(): UserPreferencesDto {
	return globalRepository.load();
}

export function saveUserPreferences(
	partial: Partial<UserPreferencesDto>,
): UserPreferencesDto {
	return globalRepository.save(partial);
}

export function resetUserPreferences(): UserPreferencesDto {
	return globalRepository.reset();
}

export function subscribeUserPreferences(
	listener: (prefs: UserPreferencesDto) => void,
): () => void {
	return globalRepository.subscribe(listener);
}

export function exportUserPreferencesBundle(): Promise<UserPreferencesExportBundleDto> {
	return globalRepository.exportBundle();
}

export function importUserPreferencesBundle(
	bundle: UserPreferencesExportBundleDto,
): Promise<UserPreferencesDto> {
	return globalRepository.importBundle(bundle);
}

export function migrateUserPreferencesBackend(
	targetKind: StorageBackendKind,
): Promise<void> {
	return globalRepository.migrateBackend(targetKind);
}

export function getActiveUserPreferencesBackendKind(): StorageBackendKind {
	return globalRepository.getBackendKind();
}
