import { createEventStore, EventStore, MemoryKvBackend } from "@stateful-mcp/core";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import { InMemoryConceptResolver } from "@stateful-mcp/core/middleware/dictionary/resolver";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { SchemaRegistry } from "@stateful-mcp/clinical/v2/schemas/schema-registry";
import { KvCellStore } from "@stateful-mcp/clinical/v2/cells/kv-cell-store";
import { KvWorkspaceStore } from "@stateful-mcp/clinical/v2/workspaces/kv-workspace-store";
import { ClinicalEngineV2Builder } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2-builder";
import {
	createV2CommandSyntaxProfile,
	type V2CommandSyntaxProfile,
} from "@stateful-mcp/clinical/v2/commands/command-syntax-profile";
import type { MacroStore } from "@stateful-mcp/clinical/v2/macros/macro-definition";
import type { ClinicalEngineV2 } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2";
import { VariableServiceStore } from "@stateful-mcp/core";

export interface V2BootstrapResult {
	engine: ClinicalEngineV2;
	sessionId: string;
	syntaxProfile: V2CommandSyntaxProfile;
}

const EMPTY_MACRO_STORE: MacroStore = {
	get: async () => null,
	list: async () => [],
};

/**
 * Native CLI2 bootstrap. This intentionally has no legacy ClinicalEngine or
 * NotebookStore dependency. Cell text compilation remains an explicit seam
 * until the V2 macro/cell compiler is connected to the notebook editor.
 */
export async function bootstrapV2Session(options: {
	sessionId?: string;
	syntaxProfile?: V2CommandSyntaxProfile;
} = {}): Promise<V2BootstrapResult> {
	const eventStorage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({
		session: eventStorage,
		persistent: eventStorage,
		schemas: new Map(),
	});
	const syntaxProfile = options.syntaxProfile ?? createV2CommandSyntaxProfile({
		profileId: "cli2-default",
		default: true,
		active: true,
	});
	const dictionary = new DictionaryStore(new InMemoryConceptResolver());
	const engine = new ClinicalEngineV2Builder()
		.withEventStore(eventStore)
		.withSchemaRegistry(new SchemaRegistry())
		.withMacroStore(EMPTY_MACRO_STORE)
		.withDictionary(dictionary)
		.withWorkspaceStore(new KvWorkspaceStore(new MemoryKvBackend()))
		.withCellStore(new KvCellStore(new MemoryKvBackend()))
		.withCellCompiler(async () => ({
			diagnostics: ["CLI2 V2 cell compiler is not wired yet"],
			fingerprint: "cli2-v2-cell-compiler-unwired",
		}))
		.withSyntaxProfile(syntaxProfile)
		.withVariableService(new VariableServiceStore())
		.build();

	return {
		engine,
		sessionId: options.sessionId ?? `cli2-${Date.now()}`,
		syntaxProfile,
	};
}
