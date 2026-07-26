import type {
	QueryCondition,
	SqlDialect,
	SqlExecutor,
} from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type {
	CalibrationException,
	CalibrationExceptionStore,
} from "./interfaces";

let _exceptionCounter = 0;

function generateExceptionId(): string {
	return `ce_${Date.now()}_${++_exceptionCounter}`;
}

export class SqlCalibrationExceptionStore implements CalibrationExceptionStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "calibration_exceptions",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
	}

	async get(exceptionId: string): Promise<CalibrationException | null> {
		const { sql, params } = this.compiler.compileGetCalibrationException(
			exceptionId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToException(row) : null;
	}

	async list(): Promise<CalibrationException[]> {
		const { sql, params } = this.compiler.compileListCalibrationExceptions(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToException(r));
	}

	async listPending(personnelId?: string): Promise<CalibrationException[]> {
		const where: QueryCondition[] = [
			{ column: "status", op: "eq", value: "pending" },
		];
		if (personnelId) {
			where.push({ column: "personnelId", op: "eq", value: personnelId });
		}
		const { sql, params } = this.compiler.compileListCalibrationExceptions(
			this.table,
			where,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToException(r));
	}

	async logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string> {
		const exceptionId = generateExceptionId();
		const { sql, params } = this.compiler.compileInsertCalibrationException(
			{
				exceptionId,
				personnelId: exception.personnelId,
				rawTerm: exception.rawTerm,
				contextSnippet: exception.contextSnippet ?? null,
				suggestedConceptId: exception.suggestedConceptId ?? null,
				status: "pending",
				createdAt: new Date().toISOString(),
			},
			this.table,
		);
		await this.executor.exec(sql, params);
		return exceptionId;
	}

	async resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void> {
		const updates: Record<string, unknown> = { status };
		if (conceptId) updates.suggestedConceptId = conceptId;
		const { sql, params } = this.compiler.compileUpdateCalibrationException(
			exceptionId,
			updates,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(exceptionId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteCalibrationException(
			exceptionId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private rowToException(row: Record<string, any>): CalibrationException {
		return {
			exceptionId: row.exceptionId as string,
			personnelId: row.personnelId as string,
			rawTerm: row.rawTerm as string,
			contextSnippet: row.contextSnippet as string | undefined,
			suggestedConceptId: row.suggestedConceptId as string | undefined,
			status: row.status as "pending" | "mapped" | "ignored",
			createdAt: row.createdAt as string,
		};
	}
}
