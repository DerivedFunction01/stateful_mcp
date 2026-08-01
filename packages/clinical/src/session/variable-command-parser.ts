import type { VariableStatement, VariableTarget } from "@stateful-mcp/core";
import { parseVariableExpression } from "@stateful-mcp/core";
import type { ParserSyntaxProfile } from "../store/interfaces";

export class VariableCommandParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VariableCommandParseError";
	}
}

function target(value: string): VariableTarget {
	const name = value.trim();
	if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) {
		throw new VariableCommandParseError(`invalid variable name '${name}'`);
	}
	return { name };
}

function assignment(body: string): [string, string] {
	const index = body.indexOf("=");
	if (index <= 0 || !body.slice(index + 1).trim()) {
		throw new VariableCommandParseError(
			"variable assignment requires name = expression",
		);
	}
	return [body.slice(0, index).trim(), body.slice(index + 1).trim()];
}

export function parseVariableCommand(
	text: string,
	profile?: Pick<
		ParserSyntaxProfile,
		"variableCommandToken" | "variableCommandMappings"
	>,
): VariableStatement {
	const token = profile?.variableCommandToken ?? ":";
	const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = text
		.trim()
		.match(
			new RegExp(
				`^${escapedToken}var\\s+([A-Za-z_][A-Za-z0-9_-]*)\\s+([\\s\\S]+)$`,
				"i",
			),
		);
	if (!match)
		throw new VariableCommandParseError(
			"expected :var <operation> <expression>",
		);
	const operation =
		profile?.variableCommandMappings?.[match[1]!.toLowerCase()] ??
		match[1]!.toLowerCase();
	const body = match[2]!.trim();

	if (operation === "set" || operation === "update") {
		const [name, expression] = assignment(body);
		return {
			kind: operation,
			target: target(name),
			value: parseVariableExpression(expression),
		};
	}
	if (operation === "remove") {
		return { kind: "remove", target: target(body) };
	}
	if (operation === "eval" || operation === "assert") {
		return {
			kind: operation,
			expression: parseVariableExpression(body),
		};
	}
	throw new VariableCommandParseError(
		`unsupported variable operation '${operation}'`,
	);
}
