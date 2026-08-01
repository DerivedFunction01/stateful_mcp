import type { ParserSyntaxProfile } from "../store/interfaces";
import {
	type CommandArgSchema,
	type CommandDescriptor,
	CommandGroup,
} from "./command-descriptor";
import type { WorkspaceSnapshot } from "./workspace-read-model";

const WORKSPACE_VERBS = [
	"branch",
	"confirm",
	"rule_out",
	"suspend",
	"re_activate",
	"elevate",
	"close",
	"complete",
] as const;

const SHARED_UI_VERBS = ["help", "back", "exit", "focus", "status"] as const;

function argsFor(verb: string): CommandArgSchema[] {
	switch (verb) {
		case "branch":
			return [
				{ name: "name", required: true, descriptionKey: "arg.branch.name" },
				{
					name: "concept",
					required: true,
					descriptionKey: "arg.branch.concept",
				},
			];
		case "elevate":
			return [
				{ name: "branch", required: true, descriptionKey: "arg.branch.ref" },
				{ name: "delta", required: true, descriptionKey: "arg.elevate.delta" },
			];
		case "focus":
			return [
				{ name: "branch", required: true, descriptionKey: "arg.branch.ref" },
			];
		case "confirm":
		case "rule_out":
		case "suspend":
		case "re_activate":
		case "complete":
			return [
				{ name: "branch", required: true, descriptionKey: "arg.branch.ref" },
			];
		default:
			return [];
	}
}

function descriptor(
	verb: string,
	group: CommandGroup,
	aliases: string[] = [],
): CommandDescriptor {
	return {
		verb,
		aliases,
		group,
		descriptionKey: `command.${verb}`,
		args: argsFor(verb),
		cellCommandToken: ":",
	};
}

export class WorkspaceCommandProvider {
	constructor(private readonly profile: ParserSyntaxProfile) {}

	getDescriptors(): CommandDescriptor[] {
		const mappings = this.profile.workspaceCommandMappings ?? {};
		const aliasesByVerb = new Map<string, string[]>();
		for (const [alias, canonical] of Object.entries(mappings)) {
			const aliases = aliasesByVerb.get(canonical) ?? [];
			aliases.push(alias);
			aliasesByVerb.set(canonical, aliases);
		}

		const workspace = WORKSPACE_VERBS.filter(
			(verb) =>
				Object.values(mappings).includes(verb as any) ||
				Object.keys(mappings).includes(verb),
		).map((verb) =>
			descriptor(verb, CommandGroup.Workspace, aliasesByVerb.get(verb)),
		);

		const shared = SHARED_UI_VERBS.map((verb) =>
			descriptor(verb, CommandGroup.Navigation),
		);
		return [...shared, ...workspace];
	}

	getArgumentCompletions(
		verb: string,
		argIndex: number,
		snapshot?: WorkspaceSnapshot | null,
	): string[] {
		const canonical = this.profile.workspaceCommandMappings?.[verb] ?? verb;
		if (canonical === "focus" || WORKSPACE_VERBS.includes(canonical as any)) {
			const branchArg =
				canonical === "branch" ? argIndex === 0 : argIndex === 0;
			if (branchArg && snapshot) {
				return snapshot.branches.flatMap((branch) =>
					[branch.branchId, branch.name, branch.commandAlias].filter(
						(value): value is string => Boolean(value),
					),
				);
			}
		}
		return [];
	}
}
