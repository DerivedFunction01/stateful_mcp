import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ProfileQueryCompiler } from "../../sql/profile-query-compiler";
import type { ParserSyntaxProfile } from "../interfaces";
import type { ParserProfileCoreStore } from "./interfaces";

const SYNTAX_KEYS: readonly (keyof ParserSyntaxProfile)[] = [
	"tagToken",
	"stateDelimiter",
	"stateStartDelimiter",
	"stateEndDelimiter",
	"macroStartToken",
	"variableStartToken",
	"variableEndToken",
	"commentStartToken",
	"commentEndToken",
	"macroPlaceholder",
	"variableDelimiter",
	"macroArgStartToken",
	"macroArgEndToken",
	"macroArgDelimiter",
	"startTermCodeDelimiter",
	"startTermDisplayDelimiter",
	"startTermCodeSeparator",
	"startTermDelimiter",
	"endTermDelimiter",
	"attributeDelimiter",
	"termTokenizer",
	"stopWordThreshold",
	"defaultsStrategy",
	"boundaryDelimiter",
	"transitionalWords",
	"numberWordConfig",
	"schemaNamespaces",
	"schemaDefaults",
	"calendarDateFormats",
	"numericFieldFormats",
	"tagMappings",
	"commandMappings",
	"workspaceCommandMappings",
	"cellCommandMappings",
	"fieldMappings",
	"cellCommandToken",
] as const;

export class SqlParserProfileStore implements ParserProfileCoreStore {
	private readonly compiler: ProfileQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_profiles",
	) {
		this.compiler = new ProfileQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(ddl.sql);
		}
		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		const { sql, params } = this.compiler.compileGetQuery(
			profileId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToProfile(row) : null;
	}

	async list(): Promise<ParserSyntaxProfile[]> {
		const { sql, params } = this.compiler.compileListQuery(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToProfile(r));
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.profileToRow(profile),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(profileId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			profileId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private profileToRow(profile: ParserSyntaxProfile): Record<string, unknown> {
		const syntax: Record<string, unknown> = {};
		for (const key of SYNTAX_KEYS) {
			const value = profile[key];
			if (value !== undefined) {
				syntax[key] = value;
			}
		}

		return {
			profileId: profile.profileId,
			personnelId: profile.personnelId,
			isDefault: profile.isDefault ? 1 : 0,
			isActive: profile.isActive !== false ? 1 : 0,
			syntax: JSON.stringify(Object.keys(syntax).length > 0 ? syntax : null),
		};
	}

	private rowToProfile(row: Record<string, any>): ParserSyntaxProfile {
		const profile: ParserSyntaxProfile = {
			profileId: row.profileId as string,
			personnelId: row.personnelId as string,
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: (row.isDefault as number) === 1,
			isActive: (row.isActive as number) === 1,
		};

		if (row.syntax != null && typeof row.syntax === "object") {
			const s = row.syntax as Record<string, any>;
			for (const key of SYNTAX_KEYS) {
				if (s[key] !== undefined && s[key] !== null) {
					(profile as any)[key] = s[key];
				}
			}
		}

		return profile;
	}
}

export type { ParserSyntaxProfile };
