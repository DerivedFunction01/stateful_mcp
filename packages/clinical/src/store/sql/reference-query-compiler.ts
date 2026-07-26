import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ReferenceQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "postgres") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	// ── Tags ────────────────────────────────────────────────────────────────────

	public getTagsTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "tag_id", type: "TEXT", primaryKey: true },
				{ name: "tag_name", type: "TEXT", nullable: false, unique: true },
				{ name: "tag_blob", type: "json", nullable: false, default: "{}" },
				{
					name: "source",
					type: "TEXT",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetTag(tagId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "tag_id", op: "eq", value: tagId }],
		});
	}

	public compileListTags(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "tag_name", direction: "ASC" }],
		});
	}

	public compileUpsertTag(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["tag_id"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteTag(tagId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "tag_id", op: "eq", value: tagId }],
		});
	}

	// ── Jurisdictional Displays ─────────────────────────────────────────────────

	public getJurisdictionalDisplaysTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["concept_id", "jurisdiction_id", "source"],
			columns: [
				{ name: "concept_id", type: "TEXT", nullable: false },
				{
					name: "jurisdiction_id",
					type: "TEXT",
					nullable: false,
					raw: "REFERENCES jurisdictions(jurisdiction_id)",
				},
				{ name: "preferred_display", type: "TEXT", nullable: false },
				{ name: "fully_specified_name", type: "TEXT", nullable: false },
				{
					name: "source",
					type: "TEXT",
					nullable: false,
					default: "local",
				},
			],
		});

		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_jurisdiction`,
			columns: ["jurisdiction_id"],
		});

		return [mainDDL, idx];
	}

	public compileGetJurisdictionalDisplay(
		conceptId: string,
		jurisdictionId: string,
		source: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "concept_id", op: "eq", value: conceptId },
				{ column: "jurisdiction_id", op: "eq", value: jurisdictionId },
				{ column: "source", op: "eq", value: source },
			],
		});
	}

	public compileListJurisdictionalDisplays(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "jurisdiction_id", direction: "ASC" },
				{ column: "concept_id", direction: "ASC" },
			],
		});
	}

	public compileUpsertJurisdictionalDisplay(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite"
				? undefined
				: ["concept_id", "jurisdiction_id", "source"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	// ── Stop Word Profiles ──────────────────────────────────────────────────────

	public getStopWordProfilesTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "profile_id", type: "TEXT", primaryKey: true },
				{
					name: "personnel_id",
					type: "TEXT",
					nullable: false,
					raw: "REFERENCES personnel(personnel_id)",
				},
				{ name: "locale_files", type: "json" },
				{ name: "specialty_files", type: "json" },
				{ name: "custom_words", type: "json" },
				{
					name: "source",
					type: "TEXT",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetStopWordProfile(
		profileId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
		});
	}

	public compileListStopWordProfiles(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "profile_id", direction: "ASC" }],
		});
	}

	public compileUpsertStopWordProfile(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profile_id"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	// ── Clinical Prose Templates ────────────────────────────────────────────────

	public getClinicalProseTemplatesTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "template_id", type: "TEXT", primaryKey: true },
				{ name: "parent_template_id", type: "TEXT" },
				{ name: "target_schema", type: "TEXT", nullable: false },
				{ name: "target_concept_id", type: "TEXT" },
				{ name: "workspace_id", type: "TEXT" },
				{
					name: "specialty_id",
					type: "TEXT",
					raw: "REFERENCES specialties(specialty_id)",
				},
				{
					name: "slot_position",
					type: "TEXT",
					nullable: false,
				},
				{ name: "template_text", type: "TEXT", nullable: false },
				{
					name: "source",
					type: "TEXT",
					nullable: false,
					default: "local",
				},
			],
		});

		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_schema_concept`,
			columns: ["target_schema", "target_concept_id"],
		});

		return [mainDDL, idx];
	}

	public compileGetClinicalProseTemplate(
		schema: string,
		position: string,
		conceptId?: string,
		workspaceId?: string,
		table: string = "clinical_prose_templates",
	): CompiledQuery {
		const where: QueryCondition[] = [
			{ column: "target_schema", op: "eq", value: schema },
			{ column: "slot_position", op: "eq", value: position },
		];

		if (conceptId) {
			where.push({ column: "target_concept_id", op: "eq", value: conceptId });
		} else {
			where.push({ column: "target_concept_id", op: "is_null" });
		}

		if (workspaceId) {
			where.push({ column: "workspace_id", op: "eq", value: workspaceId });
		}

		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "template_id", direction: "ASC" }],
			limit: 1,
		});
	}

	public compileListClinicalProseTemplates(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "target_schema", direction: "ASC" },
				{ column: "slot_position", direction: "ASC" },
			],
		});
	}

	public compileUpsertClinicalProseTemplate(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["template_id"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}
}
