import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import type {
	CommandContribution,
	CommandSource,
	WindowIntent,
	WindowScope,
} from "./extension";
import { autocompleteFromCommands, type ExtensionRegistry } from "./registry";

// TODO(cli2-v2): replace legacy CommandDescriptor values with the V2 syntax
// profile/canonical command descriptor catalog. This is not a compatibility path.

/**
 * One source of truth for command descriptors and suggestions, backed by the
 * extension command contributions for the active window scope. Used by command
 * completion, help, segmentation, and validation.
 */
export class IntentCatalog {
	constructor(private readonly registry: ExtensionRegistry) {}

	commands(scope: WindowScope, source?: CommandSource): CommandContribution[] {
		const all = this.registry.commandsFor(scope);
		return source ? all.filter((c) => c.source === source) : all;
	}

	descriptors(scope: WindowScope): CommandDescriptor[] {
		return this.commands(scope).map((c) => ({
			verb: c.id,
			aliases: c.aliases,
			group: c.group as any,
			descriptionKey: c.descriptionKey,
			args: c.args.map((a) => ({
				name: a.name,
				required: a.required,
				descriptionKey: a.descriptionKey ?? "arg.description",
				completions: a.completions,
			})),
		}));
	}

	suggestions(partial: string, scope: WindowScope): AutocompleteSuggestion[] {
		const idx = partial.indexOf(" ");
		if (idx < 0) {
			return autocompleteFromCommands(partial, this.commands(scope), "cell");
		}
		const verbPart = partial.slice(0, idx);
		const after = partial.slice(idx + 1);
		const argParts = after.split(" ");
		const argIndex = Math.max(0, argParts.length - 1);
		const prefix = argParts[argIndex] ?? "";
		const matched = this.commands(scope).find(
			(c) => c.id === verbPart || c.aliases.includes(verbPart),
		);
		if (!matched) return [];
		const arg = matched.args[argIndex];
		const values = arg?.completions ?? [];
		return values
			.filter((v) => v.startsWith(prefix))
			.slice(0, 12)
			.map((v) => ({
				verb: v,
				group: matched.group,
				source: "cell" as const,
				hasArgs: false,
				kind: "arg" as const,
				argIndex,
				argName: arg?.name,
				descriptionKey: arg?.descriptionKey,
			}));
	}

	findByVerb(
		verb: string,
		scope: WindowScope,
	): CommandContribution | undefined {
		return this.commands(scope).find(
			(c) => c.id === verb || c.aliases.includes(verb),
		);
	}

	matchCommandLine(
		line: string,
		scope: WindowScope,
	): { intentType: string; args: Record<string, string> } | null {
		const body = line.startsWith(":") ? line.slice(1) : line;
		const tokens = body.trim().split(/\s+/);
		const verb = tokens[0];
		if (!verb) return null;
		const c = this.findByVerb(verb, scope);
		if (!c) return null;
		return {
			intentType: c.intentType,
			args: { _verb: c.id, _rest: tokens.slice(1).join(" ") },
		};
	}

	toIntent(line: string, scope: WindowScope): WindowIntent | null {
		const match = this.matchCommandLine(line, scope);
		if (!match) return null;
		return {
			id: match.intentType,
			source: "commandLine",
			scope,
			arguments: match.args,
			rawInput: line,
			correlationId: crypto.randomUUID(),
		};
	}
}
