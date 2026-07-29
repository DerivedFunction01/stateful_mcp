import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ProfileQueryCompiler } from "../../sql/profile-query-compiler";
import type {
	DateTimeFormatConfig,
	NumericFieldFormatOptions,
	ParserSyntaxProfile,
} from "../interfaces";
import type { ParserProfileCoreStore } from "./interfaces";

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
		const meta: Record<string, unknown> = {};
		if (profile.schemaNamespaces)
			meta.schemaNamespaces = profile.schemaNamespaces;
		if (profile.schemaDefaults) meta.schemaDefaults = profile.schemaDefaults;
		if (profile.calendarDateFormats)
			meta.calendarDateFormats = profile.calendarDateFormats;
		if (profile.numericFieldFormats)
			meta.numericFieldFormats = profile.numericFieldFormats;
		if (profile.tagMappings) meta.tagMappings = profile.tagMappings;
		if (profile.commandMappings) meta.commandMappings = profile.commandMappings;

		return {
			profileId: profile.profileId,
			personnelId: profile.personnelId,
			isDefault: profile.isDefault ? 1 : 0,
			isActive: profile.isActive !== false ? 1 : 0,
			tagToken: profile.tagToken,
			stateDelimiter: profile.stateDelimiter,
			stateStartDelimiter: profile.stateStartDelimiter,
			stateEndDelimiter: profile.stateEndDelimiter,
			macroStartToken: profile.macroStartToken,
			variableStartToken: profile.variableStartToken,
			variableEndToken: profile.variableEndToken,
			commentStartToken: profile.commentStartToken ?? null,
			commentEndToken: profile.commentEndToken ?? null,
			macroPlaceholder: profile.macroPlaceholder ?? null,
			variableDelimiter: profile.variableDelimiter ?? null,
			macroArgStartToken: profile.macroArgStartToken ?? null,
			macroArgEndToken: profile.macroArgEndToken ?? null,
			macroArgDelimiter: profile.macroArgDelimiter ?? null,
			startTermCodeDelimiter: profile.startTermCodeDelimiter ?? null,
			startTermDisplayDelimiter: profile.startTermDisplayDelimiter ?? null,
			startTermCodeSeparator: profile.startTermCodeSeparator ?? null,
			startTermDelimiter: profile.startTermDelimiter ?? null,
			endTermDelimiter: profile.endTermDelimiter ?? null,
			attributeDelimiter: profile.attributeDelimiter ?? null,
			termTokenizer: profile.termTokenizer ?? null,
			stopWordThreshold: profile.stopWordThreshold ?? null,
			defaultsStrategy: profile.defaultsStrategy ?? null,
			metadata: JSON.stringify(Object.keys(meta).length > 0 ? meta : {}),
		};
	}

	private rowToProfile(row: Record<string, any>): ParserSyntaxProfile {
		const profile: ParserSyntaxProfile = {
			profileId: row.profileId as string,
			personnelId: row.personnelId as string,
			tagToken: row.tagToken as string,
			stateDelimiter: row.stateDelimiter as string,
			stateStartDelimiter: row.stateStartDelimiter as string,
			stateEndDelimiter: row.stateEndDelimiter as string,
			macroStartToken: row.macroStartToken as string,
			variableStartToken: row.variableStartToken as string,
			variableEndToken: row.variableEndToken as string,
			isDefault: (row.isDefault as number) === 1,
			isActive: (row.isActive as number) === 1,
		};

		if (row.commentStartToken != null)
			profile.commentStartToken = row.commentStartToken as string;
		if (row.commentEndToken != null)
			profile.commentEndToken = row.commentEndToken as string;
		if (row.macroPlaceholder != null)
			profile.macroPlaceholder = row.macroPlaceholder as string;
		if (row.variableDelimiter != null)
			profile.variableDelimiter = row.variableDelimiter as string;
		if (row.macroArgStartToken != null)
			profile.macroArgStartToken = row.macroArgStartToken as string;
		if (row.macroArgEndToken != null)
			profile.macroArgEndToken = row.macroArgEndToken as string;
		if (row.macroArgDelimiter != null)
			profile.macroArgDelimiter = row.macroArgDelimiter as string;
		if (row.startTermCodeDelimiter != null)
			profile.startTermCodeDelimiter = row.startTermCodeDelimiter as string;
		if (row.startTermDisplayDelimiter != null)
			profile.startTermDisplayDelimiter =
				row.startTermDisplayDelimiter as string;
		if (row.startTermCodeSeparator != null)
			profile.startTermCodeSeparator = row.startTermCodeSeparator as string;
		if (row.startTermDelimiter != null)
			profile.startTermDelimiter = row.startTermDelimiter as string;
		if (row.endTermDelimiter != null)
			profile.endTermDelimiter = row.endTermDelimiter as string;
		if (row.attributeDelimiter != null)
			profile.attributeDelimiter = row.attributeDelimiter as string;
		if (row.termTokenizer != null)
			profile.termTokenizer = row.termTokenizer as string;
		if (row.stopWordThreshold != null)
			profile.stopWordThreshold = Number(row.stopWordThreshold);
		if (row.defaultsStrategy != null)
			profile.defaultsStrategy = row.defaultsStrategy as string;

		if (row.metadata != null && typeof row.metadata === "object") {
			const meta = row.metadata as Record<string, any>;
			if (meta.schemaNamespaces != null)
				profile.schemaNamespaces = meta.schemaNamespaces as Record<
					string,
					string[]
				>;
			if (meta.schemaDefaults != null)
				profile.schemaDefaults = meta.schemaDefaults as Record<
					string,
					Record<string, any>
				>;
			if (meta.calendarDateFormats != null)
				profile.calendarDateFormats =
					meta.calendarDateFormats as DateTimeFormatConfig[];
			if (meta.numericFieldFormats != null)
				profile.numericFieldFormats =
					meta.numericFieldFormats as NumericFieldFormatOptions[];
			if (meta.tagMappings != null)
				profile.tagMappings = meta.tagMappings as Record<string, string>;
			if (meta.commandMappings != null)
				profile.commandMappings = meta.commandMappings as Record<
					string,
					"set" | "assert" | "eval"
				>;
		}

		return profile;
	}
}

export type { ParserSyntaxProfile };
