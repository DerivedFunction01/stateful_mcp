import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ReferenceQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	// ── Tags ────────────────────────────────────────────────────────────────────

	public getTagsTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "tagId", type: "TEXT", primaryKey: true },
				{ name: "tagName", type: "TEXT", nullable: false, unique: true },
				{ name: "tagBlob", type: "json", nullable: false, default: "{}" },
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
			where: [{ column: "tagId", op: "eq", value: tagId }],
		});
	}

	public compileListTags(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "tagName", direction: "ASC" }],
		});
	}

	public compileUpsertTag(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["tagId"];

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
			where: [{ column: "tagId", op: "eq", value: tagId }],
		});
	}

	// ── Jurisdictional Displays ─────────────────────────────────────────────────

	public getJurisdictionalDisplaysTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["conceptId", "jurisdictionId", "source"],
			columns: [
				{ name: "conceptId", type: "TEXT", nullable: false },
				{
					name: "jurisdictionId",
					type: "TEXT",
					nullable: false,
					raw: "REFERENCES jurisdictions(jurisdictionId)",
				},
				{ name: "preferredDisplay", type: "TEXT", nullable: false },
				{ name: "fullySpecifiedName", type: "TEXT", nullable: false },
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
			columns: ["jurisdictionId"],
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
				{ column: "conceptId", op: "eq", value: conceptId },
				{ column: "jurisdictionId", op: "eq", value: jurisdictionId },
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
				{ column: "jurisdictionId", direction: "ASC" },
				{ column: "conceptId", direction: "ASC" },
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
				: ["conceptId", "jurisdictionId", "source"];

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
				{ name: "profileId", type: "TEXT", primaryKey: true },
				{
					name: "personnelId",
					type: "TEXT",
					nullable: false,
					raw: "REFERENCES personnel(personnelId)",
				},
				{ name: "localeFiles", type: "json" },
				{ name: "specialtyFiles", type: "json" },
				{ name: "customWords", type: "json" },
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
			where: [{ column: "profileId", op: "eq", value: profileId }],
		});
	}

	public compileListStopWordProfiles(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "profileId", direction: "ASC" }],
		});
	}

	public compileUpsertStopWordProfile(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId"];

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
				{ name: "templateId", type: "TEXT", primaryKey: true },
				{ name: "parentTemplateId", type: "TEXT" },
				{ name: "targetSchema", type: "TEXT", nullable: false },
				{ name: "targetConceptId", type: "TEXT" },
				{ name: "workspaceId", type: "TEXT" },
				{
					name: "specialtyId",
					type: "TEXT",
					raw: "REFERENCES specialties(specialtyId)",
				},
				{
					name: "slotPosition",
					type: "TEXT",
					nullable: false,
				},
				{ name: "templateText", type: "TEXT", nullable: false },
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
			columns: ["targetSchema", "targetConceptId"],
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
			{ column: "targetSchema", op: "eq", value: schema },
			{ column: "slotPosition", op: "eq", value: position },
		];

		if (conceptId) {
			where.push({ column: "targetConceptId", op: "eq", value: conceptId });
		} else {
			where.push({ column: "targetConceptId", op: "is_null" });
		}

		if (workspaceId) {
			where.push({ column: "workspaceId", op: "eq", value: workspaceId });
		}

		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "templateId", direction: "ASC" }],
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
				{ column: "targetSchema", direction: "ASC" },
				{ column: "slotPosition", direction: "ASC" },
			],
		});
	}

	public compileUpsertClinicalProseTemplate(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["templateId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}
}
