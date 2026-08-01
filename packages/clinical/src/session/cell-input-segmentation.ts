import type { ParserSyntaxProfile } from "../store/interfaces";
import type { CellIntentKind } from "./cell";

export type CellInputSegmentKind =
	| "prose"
	| "workspace_command"
	| "variable_command"
	| "cell_configuration"
	| "ui_command";

export interface CellInputSegment {
	kind: CellInputSegmentKind;
	text: string;
	intentKind: CellIntentKind;
	startLine: number;
	endLine: number;
}

export interface CellInputCommandPolicy {
	isUiCommand?: (verb: string) => boolean;
	isWorkspaceCommand?: (verb: string) => boolean;
	isVariableCommand?: (verb: string) => boolean;
	isCellConfiguration?: (verb: string) => boolean;
}

function firstCommand(line: string, token: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith(token)) return null;
	const body = trimmed.slice(token.length).trim();
	return body.split(/\s+/, 1)[0]?.toLowerCase() || null;
}

function classify(
	line: string,
	profile: ParserSyntaxProfile,
	policy: CellInputCommandPolicy,
): CellInputSegmentKind {
	const verb = firstCommand(line, profile.cellCommandToken || ":");
	if (!verb) return "prose";
	if (policy.isUiCommand?.(verb)) return "ui_command";
	if (policy.isVariableCommand?.(verb)) return "variable_command";
	if (policy.isWorkspaceCommand?.(verb)) return "workspace_command";
	if (policy.isCellConfiguration?.(verb)) return "cell_configuration";
	return "prose";
}

function intentFor(kind: CellInputSegmentKind): CellIntentKind {
	if (kind === "workspace_command") return "workspace_command";
	if (kind === "variable_command") return "variable_command";
	if (kind === "cell_configuration") return "cell_configuration";
	if (kind === "ui_command") return "ui_command";
	return "prose";
}

/** Split submitted multiline input into ordered, single-intent cell segments. */
export function segmentCellInput(
	text: string,
	profile: ParserSyntaxProfile,
	policy: CellInputCommandPolicy = {},
): CellInputSegment[] {
	const lines = text.split("\n");
	const segments: CellInputSegment[] = [];
	let current: {
		kind: CellInputSegmentKind;
		lines: string[];
		start: number;
	} | null = null;

	const flush = (endLine: number) => {
		if (!current) return;
		const value = current.lines.join("\n").trim();
		if (value) {
			segments.push({
				kind: current.kind,
				text: value,
				intentKind: intentFor(current.kind),
				startLine: current.start,
				endLine,
			});
		}
		current = null;
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const kind = classify(line, profile, policy);
		const startsStandaloneCommand = kind !== "prose";

		if (startsStandaloneCommand) {
			flush(index - 1);
			current = { kind, lines: [line], start: index };
			continue;
		}

		if (
			!current ||
			current.kind === "workspace_command" ||
			current.kind === "variable_command" ||
			current.kind === "ui_command"
		) {
			flush(index - 1);
			current = { kind: "prose", lines: [line], start: index };
		} else {
			current.lines.push(line);
		}
	}

	flush(lines.length - 1);
	return segments;
}
