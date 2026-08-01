import type { ParserSyntaxProfile } from "../store/interfaces";
import type { CellCommand, CellCommandVerb } from "./cell-command";

export class CellCommandParser {
	static parse(text: string, profile: ParserSyntaxProfile): CellCommand | null {
		const token = profile.cellCommandToken || ":";
		const raw = text.trim();
		if (!raw.startsWith(token)) return null;
		const body = raw.slice(token.length).trim();
		if (!body) return null;
		const tokens = body.split(/\s+/).filter(Boolean);
		const alias = tokens.shift()!.toLowerCase();
		const verb = profile.cellCommandMappings?.[alias] ?? alias;
		return { verb: verb as CellCommandVerb, args: tokens, raw };
	}

	static parseKeyValues(args: string[]): {
		positional: string[];
		values: Record<string, string>;
	} {
		const positional: string[] = [];
		const values: Record<string, string> = {};
		for (const arg of args) {
			const separator = arg.indexOf("=");
			if (separator <= 0) positional.push(arg);
			else values[arg.slice(0, separator)] = arg.slice(separator + 1);
		}
		return { positional, values };
	}
}
