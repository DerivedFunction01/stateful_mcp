import type {
	VariableConceptResolver,
	VariableScopeRef,
	VariableService,
	VariableStatement,
} from "@stateful-mcp/core";
import { formatBlockId } from "@stateful-mcp/core";
import type { CellStore, ParserSyntaxProfile } from "../store/interfaces";
import type { Cell, CellCollectionRef } from "./cell";
import { parseVariableCommand } from "./variable-command-parser";

export interface VariableCellResult {
	cell: Cell;
	value?: unknown;
}

export class VariableCellService {
	constructor(
		private readonly variableService: VariableService,
		private readonly cellStore: CellStore,
		private readonly resolveConcept?: VariableConceptResolver,
		private readonly profile?: ParserSyntaxProfile,
	) {}

	async execute(
		sessionId: string,
		collection: CellCollectionRef,
		rawInput: string,
		scope?: VariableScopeRef,
	): Promise<VariableCellResult> {
		const cell: Cell = {
			cellId: `var_cell_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
			sessionId,
			collection,
			intentKind: "variable_command",
			mode: "cdsl",
			rawInput,
			routing: {
				scope: "global",
				targetSchema: null,
			},
			parsedOutput: null,
			status: "draft",
			updatedAt: new Date().toISOString(),
			context: { objects: {} },
			metadata: { variableScope: scope },
		};
		await this.cellStore.save(cell);

		try {
			const statement = parseVariableCommand(rawInput, this.profile);
			const value = await this.executeStatement(sessionId, statement, scope);
			cell.status = "committed";
			cell.metadata = {
				...(cell.metadata ?? {}),
				variableStatement: statement,
				result: value,
			};
			cell.updatedAt = new Date().toISOString();
			await this.cellStore.save(cell);
			return { cell, value };
		} catch (error) {
			cell.status = "error";
			cell.errorMessage =
				error instanceof Error ? error.message : String(error);
			cell.updatedAt = new Date().toISOString();
			await this.cellStore.save(cell);
			throw error;
		}
	}

	private async executeStatement(
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
				const value = await this.variableService.evaluateExpression(
					sessionId,
					statement.value,
					blockInstanceId,
					context,
				);
				await this.variableService.setVariable(
					sessionId,
					statement.target.name,
					value,
					blockInstanceId,
				);
				return value;
			}
			case "update":
				return this.variableService.updateVariable(
					sessionId,
					statement.target.name,
					statement.value,
					blockInstanceId,
					context,
				);
			case "eval":
				return this.variableService.evaluateExpression(
					sessionId,
					statement.expression,
					blockInstanceId,
					context,
				);
			case "assert":
				return this.variableService.assertExpression(
					sessionId,
					statement.expression,
					blockInstanceId,
					context,
				);
			case "remove":
				await this.variableService.deleteVariable(
					sessionId,
					statement.target.name,
					blockInstanceId,
				);
				return undefined;
		}
	}
}
