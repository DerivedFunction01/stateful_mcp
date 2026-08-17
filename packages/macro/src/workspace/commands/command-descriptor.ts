import type { WorkspaceCommandArgument } from "../contributions/types";

export interface WorkspaceCommandDescriptor {
	readonly id: string;
	readonly title: string;
	readonly verb?: string;
	readonly aliases?: readonly string[];
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

export function commandSuggestions(
	descriptors: readonly WorkspaceCommandDescriptor[],
	text: string,
	history: readonly string[] = [],
	limit = 8,
): readonly CommandSuggestion[] {
	const trimmed = text.replace(/^:/u, "");
	const parts = trimmed.split(/\s+/u);
	const verb = (parts[0] ?? "").toLowerCase();
	const argText = parts.slice(1).join(" ");
	const matches = descriptors.flatMap((descriptor) => {
		const names = [descriptor.verb, ...(descriptor.aliases ?? [])].filter(
			(value): value is string => Boolean(value),
		);
		const name = names.find((candidate) => candidate.toLowerCase() === verb) ?? names.find((candidate) => candidate.toLowerCase().startsWith(verb));
		if (!name) return [];
		if (parts.length > 1 && descriptor.args?.[0]?.completions) {
			return descriptor.args[0].completions
				.filter((candidate) => candidate.toLowerCase().startsWith(argText.toLowerCase()))
				.map((candidate) => ({ descriptor, value: `${name} ${candidate}`, detail: descriptor.args?.[0]?.description }));
		}
		return [{ descriptor, value: name, detail: descriptor.description }];
	});
	const historical = history
		.filter((entry) => entry.toLowerCase().startsWith(trimmed.toLowerCase()))
		.flatMap((entry) => descriptors[0] ? [{ descriptor: descriptors[0], value: entry, detail: "History" }] : []);
	return [...matches, ...historical]
		.sort((a, b) => Number(a.value.toLowerCase() !== trimmed.toLowerCase()) - Number(b.value.toLowerCase() !== trimmed.toLowerCase()))
		.slice(0, limit);
}
