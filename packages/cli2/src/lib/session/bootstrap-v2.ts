import { createEventStore, EventStore, MemoryKvBackend } from "@stateful-mcp/core";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import { InMemoryConceptResolver } from "@stateful-mcp/core/middleware/dictionary/resolver";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { createDefaultV2SchemaRegistry } from "@stateful-mcp/clinical/v2/schemas/default-registry";
import { V2CellCompiler } from "@stateful-mcp/clinical/v2/cells/v2-cell-compiler";
import { createV2SyntaxProfile } from "@stateful-mcp/clinical/v2/macros/macro-profile";
import { KvCellStore } from "@stateful-mcp/clinical/v2/cells/kv-cell-store";
import { KvWorkspaceStore } from "@stateful-mcp/clinical/v2/workspaces/kv-workspace-store";
import { ClinicalEngineV2Builder } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2-builder";
import {
	createV2CommandSyntaxProfile,
	type V2CommandSyntaxProfile,
} from "@stateful-mcp/clinical/v2/commands/command-syntax-profile";
import { KvMacroStore } from "@stateful-mcp/clinical/v2/macros/kv-macro-store";
import { seedDefaultV2Macros } from "@stateful-mcp/clinical/v2/macros/default-macros";
import type { ClinicalEngineV2 } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2";
import { V2CommandBarService } from "@stateful-mcp/clinical/v2/commands/command-bar-service";
import { V2VariableCommandService } from "@stateful-mcp/clinical/v2/commands/variable-command-service";
import type { V2VariableCellService } from "@stateful-mcp/clinical/v2/cells/variable-cell-service";
import { createV2NotebookSession, type V2NotebookSession } from "./v2-notebook-session";
import { VariableServiceStore } from "@stateful-mcp/core";

export interface V2BootstrapResult {
	engine: ClinicalEngineV2;
	commandBar: V2CommandBarService;
	variableCells: V2VariableCellService;
	notebook: V2NotebookSession;
	sessionId: string;
	syntaxProfile: V2CommandSyntaxProfile;
}


/**
 * Native CLI2 bootstrap. This intentionally has no legacy ClinicalEngine or
 * NotebookStore dependency. V2 cell compilation is wired; macro definitions
 * remain an explicit store seam until durable definitions are configured.
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
	await dictionary.loadConfig({ concepts: [{ id: "c-pneumonia", namespaceCode: "SNOMED", standardCode: "233604007", display: "Pneumonia", active: true }] });
	const macroStore = new KvMacroStore(new MemoryKvBackend());
	await seedDefaultV2Macros(macroStore);
	const schemaRegistry = createDefaultV2SchemaRegistry();
	const cellCompiler = new V2CellCompiler(
		macroStore,
		schemaRegistry,
		dictionary,
		createV2SyntaxProfile({ ...syntaxProfile, profileId: syntaxProfile.profileId }),
	);
	const engine = new ClinicalEngineV2Builder()
		.withEventStore(eventStore)
		.withSchemaRegistry(schemaRegistry)
		.withMacroStore(macroStore)
		.withDictionary(dictionary)
		.withWorkspaceStore(new KvWorkspaceStore(new MemoryKvBackend()))
		.withCellStore(new KvCellStore(new MemoryKvBackend()))
		.withCellCompiler(cellCompiler.compile.bind(cellCompiler))
		.withSyntaxProfile(syntaxProfile)
		.withVariableService(new VariableServiceStore())
		.build();
	const runtime = engine.getRuntime();
	const commandBar = new V2CommandBarService(
		engine,
		engine.getWorkspaceService(),
		syntaxProfile,
		new V2VariableCommandService(runtime.variables),
		runtime.variableCells,
	);

	const sessionId = options.sessionId ?? `cli2-${Date.now()}`;
	const notebook = createV2NotebookSession({ sessionId, engine, commandBar, variableCells: runtime.variableCells, syntaxProfile });
	return {
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		notebook,
		sessionId,
		syntaxProfile,
	};
}
