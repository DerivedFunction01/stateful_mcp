import type { VariableScopeRef } from "@stateful-mcp/core";
import type { V2CommandSyntaxProfile } from "../commands/command-syntax-profile";
import { parseV2VariableCommand } from "../commands/variable-command";
import type { V2VariableCommandService } from "../commands/variable-command-service";
import type { CellStore } from "./cell-service-types";
import type { StructuredCell, V2CellCollectionRef } from "./structured-cell";

export interface VariableCellResult {
	cell: StructuredCell;
	value?: unknown;
}

/** V2 replacement for the legacy VariableCellService. */
export class V2VariableCellService {
	constructor(
		private readonly store: CellStore,
		private readonly commands: V2VariableCommandService,
		private readonly syntaxProfile: V2CommandSyntaxProfile,
	) {}

	async execute(
		sessionId: string,
		collection: V2CellCollectionRef,
		rawInput: string,
		scope?: VariableScopeRef,
		authorId?: string,
	): Promise<VariableCellResult> {
		const cell = await this.store.create({
			sessionId,
			collection,
			rawText: rawInput,
			authorId,
		});
		try {
			const statement = parseV2VariableCommand(rawInput, this.syntaxProfile);
			const value = await this.commands.execute(sessionId, statement, scope);
			const now = new Date().toISOString();
			const committed: StructuredCell = {
				...cell,
				authored: { ...cell.authored, intent: { kind: "variable", statement } },
				lifecycle: {
					...cell.lifecycle,
					status: "committed",
					revision: cell.lifecycle.revision + 1,
				},
				source: { ...cell.source, updatedAt: now },
				execution: {
					...cell.execution,
					transactionId: `variable:${cell.cellId}`,
					committedAt: now,
				},
				diagnostics: [],
			};
			await this.store.save(committed);
			return { cell: committed, value };
		} catch (error) {
			const failed: StructuredCell = {
				...cell,
				lifecycle: {
					...cell.lifecycle,
					status: "failed",
					revision: cell.lifecycle.revision + 1,
				},
				source: { ...cell.source, updatedAt: new Date().toISOString() },
				diagnostics: [
					{
						code: "variable_command_failed",
						severity: "error",
						message: error instanceof Error ? error.message : String(error),
					},
				],
			};
			await this.store.save(failed);
			throw error;
		}
	}
}
