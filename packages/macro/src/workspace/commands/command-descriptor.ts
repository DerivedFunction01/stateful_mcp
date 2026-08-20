import type { WorkspaceCommandArgument } from "../contributions/types";
import type { CommandAliasValue } from "../keymaps/types";

export interface WorkspaceCommandDescriptor {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	readonly description?: string;
	readonly keybinding?: string;
	readonly modes?: readonly ("NORMAL" | "VISUAL" | "COMMAND")[];
	readonly args?: readonly WorkspaceCommandArgument[];
	readonly execute: (args: readonly string[]) => Promise<void> | void;
}

export interface CommandSuggestion {
	readonly descriptor: WorkspaceCommandDescriptor;
	readonly value: string;
	readonly detail?: string;
}

/**
 * Normalizes multi-alias mappings (`string | readonly string[]`) into a lookup Map of `alias -> commandId`.
 */
export function normalizeCommandAliases(
	aliases?:
		| ReadonlyMap<string, string>
		| Readonly<Record<string, CommandAliasValue>>,
): ReadonlyMap<string, string> {
	if (!aliases) return new Map();
	if (aliases instanceof Map) return aliases;

	const map = new Map<string, string>();
	for (const [commandId, aliasEntry] of Object.entries(aliases)) {
		if (Array.isArray(aliasEntry)) {
			for (const alias of aliasEntry) {
				if (typeof alias === "string" && alias.trim()) {
					map.set(alias.trim().toLowerCase(), commandId);
				}
			}
		} else if (typeof aliasEntry === "string" && aliasEntry.trim()) {
			map.set(aliasEntry.trim().toLowerCase(), commandId);
		}
	}
	return map;
}

/**
 * Dynamic Ex-command and omnibar suggestion engine.
 * Resolves typed prefixes against runtime alias maps and canonical command descriptors.
 */
export function commandSuggestions(
	descriptors: readonly WorkspaceCommandDescriptor[],
	aliases:
		| ReadonlyMap<string, string>
		| Readonly<Record<string, CommandAliasValue>> = new Map(),
	text = "",
	history: readonly string[] = [],
	limit = 8,
): readonly CommandSuggestion[] {
	const aliasMap = normalizeCommandAliases(aliases);
	const trimmed = text.replace(/^:/u, "").trim();
	const parts = trimmed.split(/\s+/u);
	const queryVerb = (parts[0] ?? "").toLowerCase();
	const argText = parts.slice(1).join(" ");
	const descriptorMap = new Map(descriptors.map((d) => [d.id, d]));

	const matches: CommandSuggestion[] = [];
	const seenValues = new Set<string>();

	// 1. Match against configured runtime aliases
	for (const [alias, commandId] of aliasMap.entries()) {
		if (!queryVerb || alias.startsWith(queryVerb)) {
			const descriptor = descriptorMap.get(commandId);
			if (descriptor) {
				const value = parts.length > 1 ? `${alias} ${argText}` : alias;
				if (!seenValues.has(value)) {
					seenValues.add(value);
					matches.push({
						descriptor,
						value,
						detail: descriptor.title,
					});
				}
			}
		}
	}

	// 2. Match against canonical command IDs
	for (const descriptor of descriptors) {
		if (!queryVerb || descriptor.id.toLowerCase().startsWith(queryVerb)) {
			if (!seenValues.has(descriptor.id)) {
				seenValues.add(descriptor.id);
				matches.push({
					descriptor,
					value: descriptor.id,
					detail: descriptor.title,
				});
			}
		}
	}

	// 3. Match historical command executions
	const historical = history
		.filter(
			(entry) =>
				entry.toLowerCase().startsWith(trimmed.toLowerCase()) &&
				!seenValues.has(entry),
		)
		.flatMap((entry) =>
			descriptors[0]
				? [{ descriptor: descriptors[0], value: entry, detail: "History" }]
				: [],
		);

	return [...matches, ...historical]
		.sort(
			(a, b) =>
				Number(a.value.toLowerCase() !== trimmed.toLowerCase()) -
				Number(b.value.toLowerCase() !== trimmed.toLowerCase()),
		)
		.slice(0, limit);
}
