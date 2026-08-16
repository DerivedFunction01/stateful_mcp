/**
 * Headless i18n translation kernel with parameter interpolation, cascading locale fallback, and extension NLS registries.
 */

export type TranslationParams = Readonly<Record<string, unknown>>;

export class I18nKernel {
	private activeLocale = "en";
	private readonly fallbackLocale = "en";
	private readonly dictionaries = new Map<string, Map<string, string>>();
	private readonly ownerKeys = new Map<
		string,
		{ locale: string; key: string }[]
	>();
	private readonly listeners = new Set<() => void>();

	constructor(initialLocale = "en") {
		this.activeLocale = initialLocale;
	}

	getActiveLocale(): string {
		return this.activeLocale;
	}

	setActiveLocale(locale: string): void {
		if (this.activeLocale !== locale) {
			this.activeLocale = locale;
			this.notify();
		}
	}

	registerTranslations(
		locale: string,
		translations: Record<string, string>,
		ownerId?: string,
	): void {
		const normalized = locale.toLowerCase();
		let dict = this.dictionaries.get(normalized);
		if (!dict) {
			dict = new Map();
			this.dictionaries.set(normalized, dict);
		}
		for (const [k, v] of Object.entries(translations)) {
			dict.set(k, v);
			if (ownerId) {
				const keys = this.ownerKeys.get(ownerId) ?? [];
				keys.push({ locale: normalized, key: k });
				this.ownerKeys.set(ownerId, keys);
			}
		}
		this.notify();
	}

	unregisterOwner(ownerId: string): void {
		const keys = this.ownerKeys.get(ownerId);
		if (!keys) return;

		for (const item of keys) {
			const dict = this.dictionaries.get(item.locale);
			dict?.delete(item.key);
		}
		this.ownerKeys.delete(ownerId);
		this.notify();
	}

	t(key: string, params?: TranslationParams): string {
		const template = this.resolveTemplate(key);
		if (!template) {
			return key;
		}
		return interpolate(template, params);
	}

	private resolveTemplate(key: string): string | undefined {
		const active = this.activeLocale.toLowerCase();

		// 1. Direct active locale (e.g. "es-es")
		const direct = this.dictionaries.get(active)?.get(key);
		if (direct !== undefined) return direct;

		// 2. Base language prefix (e.g. "es" from "es-ES")
		if (active.includes("-")) {
			const base = active.split("-")[0];
			if (base) {
				const baseMatch = this.dictionaries.get(base)?.get(key);
				if (baseMatch !== undefined) return baseMatch;
			}
		}

		// 3. Fallback locale ("en")
		const fallback = this.dictionaries.get(this.fallbackLocale)?.get(key);
		if (fallback !== undefined) return fallback;

		return undefined;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in I18nKernel listener:", e);
			}
		}
	}
}

function interpolate(template: string, params?: TranslationParams): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, key) => {
		const val = params[key];
		return val !== undefined ? String(val) : match;
	});
}
