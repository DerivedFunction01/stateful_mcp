import type { ResourceLocator, SqlDialect } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	readStringOption,
	resolveDbPath,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { ClinicalStoreConfig } from "../clinical-config";
import type { SignedSoapNoteStore } from "../interfaces";
import { KvSignedSoapNoteStore } from "./kv-signed-note-store";
import { SqlSignedSoapNoteStore } from "./sql-signed-note-store";

function getPrimaryLocator(
	config: ClinicalStoreConfig,
	group: string,
): ResourceLocator {
	const domain = config.domains[group];
	if (!domain?.defaultAdapters?.[0]?.primary) {
		throw new Error(`No primary adapter configured for domain: ${group}`);
	}
	return domain.defaultAdapters[0].primary;
}

export async function resolveSignedNoteStore(
	config: ClinicalStoreConfig,
): Promise<SignedSoapNoteStore> {
	const locator = getPrimaryLocator(config, "signed_note");

	if (locator._type !== "adapter") {
		throw new Error(`Unsupported signed-note locator type: ${locator._type}`);
	}

	switch (locator.name) {
		case "memory":
			return new KvSignedSoapNoteStore(new MemoryKvBackend());
		case "jsonl": {
			const path =
				readStringOption(locator, "path", "") || "signed-notes.jsonl";
			return new KvSignedSoapNoteStore(
				new JsonlKvBackend({ dataFilePath: path }),
			);
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs": {
			const dialect = locator.name as SqlDialect;
			const backend = await SqlBackend.connect(
				dialect,
				resolveDbPath(locator, dialect, "signed-notes"),
			);
			return new SqlSignedSoapNoteStore(dialect, new SqlExecutor(backend));
		}
		default:
			throw new Error(
				`Unsupported signed-note adapter: ${(locator as any).name ?? locator._type}`,
			);
	}
}
