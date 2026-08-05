import type {
	VariableBinaryOperator,
	VariableExpression,
	VariableFunctionName,
	VariableSourceSpan,
} from "./ast";

type TokenKind =
	| "eof"
	| "identifier"
	| "number"
	| "string"
	| "concept"
	| "expression"
	| "operator"
	| "punctuation";

interface Token {
	kind: TokenKind;
	value: string;
	start: number;
	end: number;
}

export class VariableExpressionParseError extends Error {
	constructor(
		message: string,
		public readonly span: VariableSourceSpan,
	) {
		super(message);
		this.name = "VariableExpressionParseError";
	}
}

const FUNCTIONS = new Set<VariableFunctionName>([
	"year",
	"month",
	"day",
	"quarter",
	"date_diff",
	"get",
	"json_parse",
	"to_string",
	"to_number",
	"round",
	"ceil",
	"floor",
	"starts_with",
	"ends_with",
	"str_contains",
	"substring",
	"trim",
	"lower",
	"upper",
	"concat",
]);

const PRECEDENCE: Record<string, number> = {
	or: 1,
	"||": 1,
	and: 2,
	"&&": 2,
	in: 3,
	"not in": 3,
	"==": 4,
	"!=": 4,
	"<": 5,
	"<=": 5,
	">": 5,
	">=": 5,
	"+": 6,
	"-": 6,
	"*": 7,
	"/": 7,
	"%": 7,
	"^": 8,
};

function span(start: number, end: number): VariableSourceSpan {
	return { start, end };
}

export interface VariableReferenceTokens {
	expressionToken: string;
	conceptToken: string;
}

function tokenize(
	input: string,
	tokensConfig: VariableReferenceTokens,
): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < input.length) {
		const char = input[index]!;
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		const start = index;
		if (char === '"' || char === "'") {
			const quote = char;
			index++;
			let value = "";
			while (index < input.length && input[index] !== quote) {
				if (input[index] === "\\" && index + 1 < input.length) {
					index++;
					value += input[index++];
				} else {
					value += input[index++];
				}
			}
			if (input[index] !== quote) {
				throw new VariableExpressionParseError(
					"unterminated string literal",
					span(start, index),
				);
			}
			index++;
			tokens.push({ kind: "string", value, start, end: index });
			continue;
		}
		const referenceKind =
			tokensConfig.expressionToken &&
			input.startsWith(tokensConfig.expressionToken, index)
				? "expression"
				: tokensConfig.conceptToken &&
						input.startsWith(tokensConfig.conceptToken, index)
					? "concept"
					: undefined;
		if (referenceKind) {
			const token =
				referenceKind === "expression"
					? tokensConfig.expressionToken
					: tokensConfig.conceptToken;
			index += token.length;
			if (input[index] === '"' || input[index] === "'") {
				const quote = input[index++];
				let value = "";
				while (index < input.length && input[index] !== quote) {
					if (input[index] === "\\" && index + 1 < input.length) index++;
					value += input[index++];
				}
				if (input[index] !== quote) {
					throw new VariableExpressionParseError(
						"unterminated reference",
						span(start, index),
					);
				}
				index++;
				tokens.push({ kind: referenceKind, value, start, end: index });
				continue;
			}
			while (index < input.length && !/[\s(),[\]]/.test(input[index]!)) index++;
			tokens.push({
				kind: referenceKind,
				value: input.slice(start + token.length, index),
				start,
				end: index,
			});
			continue;
		}
		if (
			/\d/.test(char) ||
			(char === "." && /\d/.test(input[index + 1] ?? ""))
		) {
			index++;
			while (index < input.length && /[\d.]/.test(input[index]!)) index++;
			tokens.push({
				kind: "number",
				value: input.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		if (/[A-Za-z_]/.test(char)) {
			index++;
			while (index < input.length && /[A-Za-z0-9_]/.test(input[index]!))
				index++;
			tokens.push({
				kind: "identifier",
				value: input.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		const two = input.slice(index, index + 2);
		if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
			index += 2;
			tokens.push({ kind: "operator", value: two, start, end: index });
			continue;
		}
		if ("+-*/%^!<>".includes(char)) {
			index++;
			tokens.push({ kind: "operator", value: char, start, end: index });
			continue;
		}
		if ("(),[].".includes(char)) {
			index++;
			tokens.push({ kind: "punctuation", value: char, start, end: index });
			continue;
		}
		throw new VariableExpressionParseError(
			`unexpected character '${char}'`,
			span(start, index + 1),
		);
	}
	tokens.push({
		kind: "eof",
		value: "",
		start: input.length,
		end: input.length,
	});
	return tokens;
}

export class VariableExpressionParser {
	private index = 0;
	private readonly tokens: Token[];

	constructor(
		input: string,
		tokens: VariableReferenceTokens = { expressionToken: "", conceptToken: "" },
	) {
		if (
			tokens.expressionToken &&
			tokens.expressionToken === tokens.conceptToken
		)
			throw new Error("expression and concept tokens must be distinct");
		this.tokens = tokenize(input, tokens);
	}

	parse(): VariableExpression {
		const expression = this.parseExpression(0);
		const token = this.peek();
		if (token.kind !== "eof") {
			throw this.error(`unexpected token '${token.value}'`, token);
		}
		return expression;
	}

	private parseExpression(minPrecedence: number): VariableExpression {
		let left = this.parsePrefix();
		while (true) {
			const operator = this.peekBinaryOperator();
			if (!operator) break;
			const precedence = PRECEDENCE[operator] ?? -1;
			if (precedence < minPrecedence) break;
			this.consumeBinaryOperator(operator);
			const right = this.parseExpression(
				operator === "^" ? precedence : precedence + 1,
			);
			left = {
				kind: "binary",
				operator: this.mapOperator(operator),
				left,
				right,
				sourceSpan: span(
					left.sourceSpan?.start ?? 0,
					right.sourceSpan?.end ?? 0,
				),
			};
		}
		return left;
	}

	private parsePrefix(): VariableExpression {
		const token = this.peek();
		if (token.value === "-" || token.value === "!") {
			this.consume();
			const operand = this.parsePrefix();
			return {
				kind: "unary",
				operator: token.value === "-" ? "negate" : "not",
				operand,
				sourceSpan: span(token.start, operand.sourceSpan?.end ?? token.end),
			};
		}
		if (token.kind === "identifier" && token.value.toLowerCase() === "not") {
			this.consume();
			const operand = this.parsePrefix();
			return {
				kind: "unary",
				operator: "not",
				operand,
				sourceSpan: span(token.start, operand.sourceSpan?.end ?? token.end),
			};
		}
		let expression: VariableExpression;
		if (token.value === "(") {
			this.consume();
			expression = this.parseExpression(0);
			this.expect(")");
		} else if (token.value === "[") {
			this.consume();
			const elements: VariableExpression[] = [];
			while (this.peek().value !== "]") {
				elements.push(this.parseExpression(0));
				if (this.peek().value !== ",") break;
				this.consume();
			}
			this.expect("]");
			expression = {
				kind: "array",
				elements,
				sourceSpan: span(token.start, this.previous().end),
			};
		} else if (token.kind === "number") {
			this.consume();
			expression = {
				kind: "literal",
				value: Number(token.value),
				sourceSpan: span(token.start, token.end),
			};
		} else if (token.kind === "string") {
			this.consume();
			expression = {
				kind: "literal",
				value: token.value,
				sourceSpan: span(token.start, token.end),
			};
		} else if (token.kind === "concept" || token.kind === "expression") {
			this.consume();
			expression = {
				kind: token.kind,
				query: token.value,
				sourceSpan: span(token.start, token.end),
			};
		} else if (token.kind === "identifier") {
			this.consume();
			const normalized = token.value.toLowerCase();
			if (
				normalized === "true" ||
				normalized === "false" ||
				normalized === "null"
			) {
				expression = {
					kind: "literal",
					value: normalized === "null" ? null : normalized === "true",
					sourceSpan: span(token.start, token.end),
				};
			} else if (this.peek().value === "(") {
				if (!FUNCTIONS.has(normalized as VariableFunctionName))
					throw this.error(`unsupported function '${token.value}'`, token);
				this.consume();
				const args: VariableExpression[] = [];
				while (this.peek().value !== ")") {
					args.push(this.parseExpression(0));
					if (this.peek().value !== ",") break;
					this.consume();
				}
				this.expect(")");
				expression = {
					kind: "call",
					name: normalized as VariableFunctionName,
					args,
					sourceSpan: span(token.start, this.previous().end),
				};
			} else {
				expression = {
					kind: "variable",
					name: token.value,
					sourceSpan: span(token.start, token.end),
				};
			}
		} else {
			throw this.error(`expected expression, got '${token.value}'`, token);
		}
		while (this.peek().value === ".") {
			this.consume();
			const property = this.peek();
			if (property.kind !== "identifier")
				throw this.error("expected property name", property);
			this.consume();
			expression = {
				kind: "property",
				object: expression,
				property: property.value,
				sourceSpan: span(
					expression.sourceSpan?.start ?? property.start,
					property.end,
				),
			};
		}
		return expression;
	}

	private peekBinaryOperator(): string | null {
		const token = this.peek();
		if (token.kind === "operator" && PRECEDENCE[token.value] !== undefined)
			return token.value;
		if (token.kind === "identifier" && token.value.toLowerCase() === "in")
			return "in";
		if (token.kind === "identifier" && token.value.toLowerCase() === "and")
			return "and";
		if (token.kind === "identifier" && token.value.toLowerCase() === "or")
			return "or";
		if (
			token.kind === "identifier" &&
			token.value.toLowerCase() === "not" &&
			this.tokens[this.index + 1]?.value.toLowerCase() === "in"
		)
			return "not in";
		return null;
	}

	private consumeBinaryOperator(operator: string): void {
		this.consume();
		if (operator === "not in") this.consume();
	}

	private mapOperator(operator: string): VariableBinaryOperator {
		const map: Record<string, VariableBinaryOperator> = {
			"+": "add",
			"-": "sub",
			"*": "mul",
			"/": "div",
			"%": "mod",
			"^": "exp",
			"<": "lt",
			"<=": "leq",
			"==": "eq",
			"!=": "neq",
			">=": "geq",
			">": "gt",
			and: "and",
			"&&": "and",
			or: "or",
			"||": "or",
			in: "in_set",
			"not in": "not_in_set",
		};
		return map[operator]!;
	}

	private peek(): Token {
		return this.tokens[this.index]!;
	}
	private previous(): Token {
		return this.tokens[Math.max(0, this.index - 1)]!;
	}
	private consume(): Token {
		return this.tokens[this.index++]!;
	}
	private expect(value: string): void {
		const token = this.consume();
		if (token.value !== value)
			throw this.error(`expected '${value}', got '${token.value}'`, token);
	}
	private error(message: string, token: Token): VariableExpressionParseError {
		return new VariableExpressionParseError(
			message,
			span(token.start, token.end),
		);
	}
}

export function parseVariableExpression(
	input: string,
	tokens: VariableReferenceTokens = { expressionToken: "", conceptToken: "" },
): VariableExpression {
	return new VariableExpressionParser(input, tokens).parse();
}
