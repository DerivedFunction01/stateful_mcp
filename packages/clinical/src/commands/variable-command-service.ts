import type {
	VariableConceptResolver,
	VariableScopeRef,
	VariableService,
	VariableStatement,
} from "@stateful-mcp/core";
import { formatBlockId } from "@stateful-mcp/core";

export class V2VariableCommandService {
	constructor(
		private readonly variables: VariableService,
		private readonly resolveConcept?: VariableConceptResolver,
	) {}

	async execute(
		sessionId: string,
		statement: VariableStatement,
		scope?: VariableScopeRef,
	): Promise<unknown> {
		const blockInstanceId = formatBlockId(scope);
		const context = this.resolveConcept
			? { resolveConcept: this.resolveConcept }
			: undefined;
		switch (statement.kind) {
			case "set": {
				const value = await this.variables.evaluateExpression(
					sessionId,
					statement.value,
					blockInstanceId,
					context,
				);
				await this.variables.setVariable(
					sessionId,
					statement.target.name,
					value,
					blockInstanceId,
				);
				return value;
			}
			case "update":
				return this.variables.updateVariable(
					sessionId,
					statement.target.name,
					statement.value,
					blockInstanceId,
					context,
				);
			case "eval":
				return this.variables.evaluateExpression(
					sessionId,
					statement.expression,
					blockInstanceId,
					context,
				);
			case "assert":
				return this.variables.assertExpression(
					sessionId,
					statement.expression,
					blockInstanceId,
					context,
				);
			case "remove":
				await this.variables.deleteVariable(
					sessionId,
					statement.target.name,
					blockInstanceId,
				);
				return undefined;
		}
	}
}
