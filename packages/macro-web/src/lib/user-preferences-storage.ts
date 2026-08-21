import type { UserPreferencesDto } from "@stateful-mcp/macro-protocol";

export const USER_PREFERENCES_STORAGE_KEY = "macro.user.preferences.v1";

export const DEFAULT_USER_PREFERENCES: UserPreferencesDto = {
	keymapProfile: "default",
	vimEnabled: false,
	theme: "dark",
	locale: "en",
	autoPurgeOnExecute: false,
	customKeybindings: [],
};

const listeners = new Set<(prefs: UserPreferencesDto) => void>();

function safeGetLocalStorage(): Storage | null {
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage;
		}
	} catch {
		// Ignore storage permission/access errors
	}
	return null;
}

let memoryCache: UserPreferencesDto | null = null;

export function loadUserPreferences(): UserPreferencesDto {
	if (memoryCache) return memoryCache;
	const storage = safeGetLocalStorage();
	if (!storage) {
		memoryCache = { ...DEFAULT_USER_PREFERENCES };
		return memoryCache;
	}

	try {
		const raw = storage.getItem(USER_PREFERENCES_STORAGE_KEY);
		if (!raw) {
			memoryCache = { ...DEFAULT_USER_PREFERENCES };
			return memoryCache;
		}
		const parsed = JSON.parse(raw) as Partial<UserPreferencesDto>;
		memoryCache = {
			...DEFAULT_USER_PREFERENCES,
			...parsed,
			keymapProfile:
				parsed.keymapProfile || DEFAULT_USER_PREFERENCES.keymapProfile,
			theme: parsed.theme || DEFAULT_USER_PREFERENCES.theme,
			locale: parsed.locale || DEFAULT_USER_PREFERENCES.locale,
			vimEnabled: Boolean(parsed.vimEnabled),
			autoPurgeOnExecute: Boolean(parsed.autoPurgeOnExecute),
			customKeybindings: Array.isArray(parsed.customKeybindings)
				? parsed.customKeybindings
				: DEFAULT_USER_PREFERENCES.customKeybindings,
		};
		return memoryCache;
	} catch {
		memoryCache = { ...DEFAULT_USER_PREFERENCES };
		return memoryCache;
	}
}

export function saveUserPreferences(
	partial: Partial<UserPreferencesDto>,
): UserPreferencesDto {
	const current = loadUserPreferences();
	const next: UserPreferencesDto = {
		...current,
		...partial,
	};
	memoryCache = next;

	const storage = safeGetLocalStorage();
	if (storage) {
		try {
			storage.setItem(USER_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
		} catch (e) {
			console.warn("Failed to persist user preferences to localStorage:", e);
		}
	}

	for (const listener of listeners) {
		try {
			listener(next);
		} catch (e) {
			console.error("Error in user preferences listener:", e);
		}
	}

	return next;
}

export function resetUserPreferences(): UserPreferencesDto {
	return saveUserPreferences(DEFAULT_USER_PREFERENCES);
}

export function subscribeUserPreferences(
	listener: (prefs: UserPreferencesDto) => void,
): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
