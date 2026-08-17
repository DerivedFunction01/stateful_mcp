import type { SettingsSchemaEntry } from "../config/settings-service";
import type { ExtensionSettingsContribution } from "./types";

export interface RegisteredExtensionSettings
	extends ExtensionSettingsContribution {
	readonly extensionId: string;
	readonly storagePrefix: readonly string[];
	readonly normalizedSchema: readonly SettingsSchemaEntry[];
}

export class SettingsContributionRegistry {
	private readonly entries = new Map<string, RegisteredExtensionSettings>();
	private readonly listeners = new Set<() => void>();

	register(
		extensionId: string,
		contribution: ExtensionSettingsContribution,
	): void {
		if (
			contribution.namespace !== extensionId &&
			!contribution.namespace.startsWith(`${extensionId}.`)
		) {
			throw new Error(
				`Settings namespace '${contribution.namespace}' must be owned by '${extensionId}'`,
			);
		}
		if (this.entries.has(contribution.namespace))
			throw new Error(
				`Duplicate settings namespace '${contribution.namespace}'`,
			);
		const storagePrefix = ["extensions", contribution.namespace];
		this.entries.set(contribution.namespace, {
			...contribution,
			extensionId,
			storagePrefix,
			normalizedSchema: contribution.schema.map((entry) => ({
				...entry,
				path: [...storagePrefix, ...entry.path],
			})),
		});
		this.notify();
	}

	unregisterOwner(extensionId: string): void {
		let changed = false;
		for (const [namespace, entry] of this.entries) {
			if (entry.extensionId === extensionId) {
				this.entries.delete(namespace);
				changed = true;
			}
		}
		if (changed) this.notify();
	}

	unregister(namespace: string): void {
		if (!this.entries.delete(namespace)) return;
		this.notify();
	}

	get(namespace: string): RegisteredExtensionSettings | undefined {
		return this.entries.get(namespace);
	}
	list(): readonly RegisteredExtensionSettings[] {
		return [...this.entries.values()].sort((a, b) =>
			a.namespace.localeCompare(b.namespace),
		);
	}
	getSchema(): readonly SettingsSchemaEntry[] {
		return this.list().flatMap((entry) => entry.normalizedSchema);
	}
	getDefaults(): Readonly<Record<string, unknown>> {
		const result: Record<string, unknown> = {};
		for (const entry of this.list()) {
			if (entry.defaults)
				setAtPath(result, entry.storagePrefix, entry.defaults);
		}
		return result;
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function setAtPath(
	root: Record<string, unknown>,
	path: readonly string[],
	value: Readonly<Record<string, unknown>>,
): void {
	let current = root;
	for (const key of path) {
		if (
			!current[key] ||
			typeof current[key] !== "object" ||
			Array.isArray(current[key])
		)
			current[key] = {};
		current = current[key] as Record<string, unknown>;
	}
	mergeInto(current, value);
}

function mergeInto(
	target: Record<string, unknown>,
	source: Readonly<Record<string, unknown>>,
): void {
	for (const [key, value] of Object.entries(source)) {
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			target[key] &&
			typeof target[key] === "object" &&
			!Array.isArray(target[key])
		)
			mergeInto(
				target[key] as Record<string, unknown>,
				value as Record<string, unknown>,
			);
		else target[key] = structuredClone(value);
	}
}
