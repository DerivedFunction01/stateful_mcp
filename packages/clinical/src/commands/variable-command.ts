import type { VariableStatement, VariableTarget } from "@stateful-mcp/core";
import { parseVariableExpression } from "@stateful-mcp/core";
import type { CommandSyntaxProfile } from "./command-syntax-profile";

export class VariableCommandParseError extends Error {}

export function parseVariableCommand(
	rawText: string,
	profile: CommandSyntaxProfile,
): VariableStatement {
	const escaped = profile.variableCommandToken.replace(
		/[.*+?^${}()|[\]\\]/g,
		"\\$&",
	);
	const commandName = profile.variableCommandName.replace(
		/[.*+?^${}()|[\]\\]/g,
		"\\$&",
	);
	const match = rawText
		.trim()
		.match(
			new RegExp(
				`^${escaped}${commandName}\\s+(\\S+)(?:\\s+([\\s\\S]+))?$`,
				"i",
			),
		);
	if (!match) throw new VariableCommandParseError("invalid_variable_command");
	const operation = profile.variableCommandMappings[match[1]!.toLowerCase()];
	if (!operation)
		throw new VariableCommandParseError("unsupported_variable_operation");
	const body = match[2]?.trim() ?? "";
	if (operation === "remove")
		return { kind: "remove", target: target(body, profile) };
	if (operation === "set" || operation === "update") {
		const separator = body.indexOf(profile.variableAssignmentDelimiter);
		if (
			separator <= 0 ||
			!body.slice(separator + profile.variableAssignmentDelimiter.length).trim()
		)
			throw new VariableCommandParseError("invalid_variable_assignment");
		return {
			kind: operation,
			target: target(body.slice(0, separator), profile),
			value: parseVariableExpression(
				body
					.slice(separator + profile.variableAssignmentDelimiter.length)
					.trim(),
			),
		};
	}
	if (operation === "eval" || operation === "assert") {
		if (!body)
			throw new VariableCommandParseError("missing_variable_expression");
		return { kind: operation, expression: parseVariableExpression(body) };
	}
	throw new VariableCommandParseError("unsupported_variable_operation");
}

function target(value: string, profile: CommandSyntaxProfile): VariableTarget {
	const name = value.trim();
	if (!new RegExp(profile.variableNamePattern, "u").test(name))
		throw new VariableCommandParseError("invalid_variable_name");
	return { name };
}
