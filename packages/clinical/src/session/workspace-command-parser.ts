import type { ParserSyntaxProfile } from "../store/interfaces";
import type { WorkspaceCommand, WorkspaceCommandWarning } from "../engine/workspace-store";

export interface WorkspaceCommandParseResult {
	remainingText: string;
	commands: WorkspaceCommand[];
	warnings: WorkspaceCommandWarning[];
}

export class WorkspaceCommandParser {
	parseCell(text: string, profile: ParserSyntaxProfile): WorkspaceCommandParseResult {
		const commands: WorkspaceCommand[] = [];
		const warnings: WorkspaceCommandWarning[] = [];
		const remaining: string[] = [];
		const tagToken = profile.tagToken || "#";
		const target = "WorkspaceCommand";
		for (const segment of text.split(profile.stateDelimiter || "||")) {
			const trimmed = segment.trim();
			const match = trimmed.match(new RegExp(`^${this.escape(tagToken)}([^\\s]+)\\s*(.*)$`));
			if (!match) {
				remaining.push(segment);
				continue;
			}
			const tag = match[1]!.toLowerCase();
			const mapped = profile.tagMappings?.[tag] ?? tag;
			if (mapped.toLowerCase() !== target.toLowerCase()) {
				remaining.push(segment);
				continue;
			}
			const tokens = (match[2] ?? "").trim().split(/\s+/).filter(Boolean);
			const verb = profile.workspaceCommandMappings?.[tokens[0]?.toLowerCase() ?? ""];
			if (!verb) {
				warnings.push("UNKNOWN_ALIAS");
				continue;
			}
			const args = tokens.slice(1);
			const command = this.parseCommand(verb, args);
			if (command) commands.push(command);
			else warnings.push("MALFORMED");
		}
		return { remainingText: remaining.join(` ${profile.stateDelimiter || "||"} `).trim(), commands, warnings };
	}

	private parseCommand(verb: WorkspaceCommand["verb"], args: string[]): WorkspaceCommand | null {
		if (verb === "close") return args.length === 0 ? { verb } : null;
		if (verb === "branch") return args.length >= 2 ? { verb, branchName: args[0]!, conceptRef: args.slice(1).join(" ") } : null;
		if (verb === "elevate") {
			const delta = Number(args[1]);
			return args.length === 2 && Number.isFinite(delta) ? { verb, branchRef: args[0]!, delta } : null;
		}
		return args.length === 1 ? { verb, branchRef: args[0]! } : null;
	}

	private escape(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
