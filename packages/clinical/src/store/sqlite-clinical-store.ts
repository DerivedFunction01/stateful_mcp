import type { Database } from "bun:sqlite";
import { SqliteEntityStore } from "@stateful-mcp/core";
import { SEED_CONCEPT_DEFAULTS, SEED_PARSER_PROFILES } from "./defaults";
import type {
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
} from "./interfaces";

export class SqliteParserProfileStore implements ParserProfileStore {
	private entityStore: SqliteEntityStore<ParserSyntaxProfile>;

	constructor(db: Database, tableName = "parser_syntax_profiles") {
		this.entityStore = new SqliteEntityStore<ParserSyntaxProfile>(
			db,
			tableName,
		);

		// Seed database if it's empty
		this.list().then((list) => {
			if (list.length === 0) {
				for (const profile of SEED_PARSER_PROFILES) {
					this.set(profile);
				}
			}
		});
	}

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		return this.entityStore.get(profileId);
	}

	async getByPersonnel(
		personnelId: string,
	): Promise<ParserSyntaxProfile | null> {
		const list = await this.entityStore.list();
		for (const profile of list) {
			if (profile.personnelId === personnelId) return profile;
		}
		return null;
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		await this.entityStore.set(profile.profileId, profile);
	}

	async delete(profileId: string): Promise<void> {
		await this.entityStore.delete(profileId);
	}

	async list(): Promise<ParserSyntaxProfile[]> {
		return this.entityStore.list();
	}
}

export class SqliteParserConceptDefaultStore
	implements ParserConceptDefaultStore
{
	private entityStore: SqliteEntityStore<ParserConceptDefault>;

	constructor(db: Database, tableName = "parser_concept_defaults") {
		this.entityStore = new SqliteEntityStore<ParserConceptDefault>(
			db,
			tableName,
		);

		// Seed database if it's empty
		this.entityStore.list().then((list) => {
			if (list.length === 0) {
				for (const record of SEED_CONCEPT_DEFAULTS) {
					this.set(record);
				}
			}
		});
	}

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		const key = `${anchorConceptId}:${targetSchema}`;
		return this.entityStore.get(key);
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		const list = await this.entityStore.list();
		return list.filter((record) => record.targetSchema === targetSchema);
	}

	async set(record: ParserConceptDefault): Promise<void> {
		const key = `${record.anchorConceptId}:${record.targetSchema}`;
		await this.entityStore.set(key, record);
	}
}
