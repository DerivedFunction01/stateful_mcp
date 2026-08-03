import type { VariableStatement, VariableTarget } from "@stateful-mcp/core";
import { parseVariableExpression } from "@stateful-mcp/core";
import type { V2CommandSyntaxProfile } from "./command-syntax-profile";

export class V2VariableCommandParseError extends Error {}

export function parseV2VariableCommand(
	rawText: string,
	profile: V2CommandSyntaxProfile,
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
	if (!match) throw new V2VariableCommandParseError("invalid_variable_command");
	const operation = profile.variableCommandMappings[match[1]!.toLowerCase()];
	if (!operation)
		throw new V2VariableCommandParseError("unsupported_variable_operation");
	const body = match[2]?.trim() ?? "";
	if (operation === "remove")
		return { kind: "remove", target: target(body, profile) };
	if (operation === "set" || operation === "update") {
		const separator = body.indexOf(profile.variableAssignmentDelimiter);
		if (
			separator <= 0 ||
			!body.slice(separator + profile.variableAssignmentDelimiter.length).trim()
		)
			throw new V2VariableCommandParseError("invalid_variable_assignment");
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
			throw new V2VariableCommandParseError("missing_variable_expression");
		return { kind: operation, expression: parseVariableExpression(body) };
	}
	throw new V2VariableCommandParseError("unsupported_variable_operation");
}

function target(
	value: string,
	profile: V2CommandSyntaxProfile,
): VariableTarget {
	const name = value.trim();
	if (!new RegExp(profile.variableNamePattern, "u").test(name))
		throw new V2VariableCommandParseError("invalid_variable_name");
	return { name };
}
