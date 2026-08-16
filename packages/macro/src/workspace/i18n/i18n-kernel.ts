/**
 * Headless i18n translation kernel with parameter interpolation, cascading locale fallback, and extension NLS registries.
 */

export type TranslationParams = Readonly<Record<string, unknown>>;

interface TranslationRegistration {
	readonly value: string;
	readonly ownerId?: string;
}

export class I18nKernel {
	private activeLocale = "en";
	private readonly fallbackLocale = "en";
	private readonly dictionaries = new Map<
		string,
		Map<string, TranslationRegistration[]>
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
			const registrations = dict.get(k) ?? [];
			registrations.push({ value: v, ownerId });
			dict.set(k, registrations);
		}
		this.notify();
	}

	unregisterOwner(ownerId: string): void {
		let changed = false;
		for (const dict of this.dictionaries.values()) {
			for (const [key, registrations] of dict) {
				const remaining = registrations.filter(
					(registration) => registration.ownerId !== ownerId,
				);
				if (remaining.length !== registrations.length) {
					changed = true;
					if (remaining.length > 0) dict.set(key, remaining);
					else dict.delete(key);
				}
			}
		}
		if (changed) this.notify();
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
		const direct = this.dictionaries.get(active)?.get(key)?.at(-1)?.value;
		if (direct !== undefined) return direct;

		// 2. Base language prefix (e.g. "es" from "es-ES")
		if (active.includes("-")) {
			const base = active.split("-")[0];
			if (base) {
				const baseMatch = this.dictionaries.get(base)?.get(key)?.at(-1)?.value;
				if (baseMatch !== undefined) return baseMatch;
			}
		}

		// 3. Fallback locale ("en")
		const fallback = this.dictionaries
			.get(this.fallbackLocale)
			?.get(key)
			?.at(-1)?.value;
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
