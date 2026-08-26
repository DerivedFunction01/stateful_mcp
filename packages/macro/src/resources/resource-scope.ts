import type { ExpressionBackend } from "../contracts/backends";
import type { RecipeOutputBuilder, TerminalParser } from "../values/recipes";
import type { DictionaryResource } from "./contracts";

export class ResourceScope {
	private readonly resources = new Set<DictionaryResource>();
	private readonly backends = new Map<string, ExpressionBackend>();
	private readonly terminals = new Map<string, TerminalParser>();
	private readonly outputBuilders = new Map<string, RecipeOutputBuilder>();
	private closed = false;

	constructor(readonly ownerExtensionId: string) {}

	trackResource(resource: DictionaryResource): DictionaryResource {
		this.assertOpen();
		this.resources.add(resource);
		return resource;
	}

	registerBackend(id: string, backend: ExpressionBackend): void {
		this.assertOpen();
		if (this.backends.has(id) && this.backends.get(id) !== backend) {
			throw new Error(`Expression backend '${id}' is already registered`);
		}
		if (!backend.ownerExtensionId) {
			backend.ownerExtensionId = this.ownerExtensionId;
		}
		if (!backend.resourceId) {
			backend.resourceId = id;
		}
		this.backends.set(id, backend);
	}

	getBackend(id: string): ExpressionBackend | undefined {
		return this.backends.get(id);
	}

	listBackends(): Readonly<Record<string, ExpressionBackend>> {
		return Object.fromEntries(this.backends);
	}

	registerTerminal(id: string, parser: TerminalParser): void {
		this.assertOpen();
		if (this.terminals.has(id) && this.terminals.get(id) !== parser)
			throw new Error(`Value terminal '${id}' is already registered`);
		this.terminals.set(id, parser);
	}

	listTerminals(): Readonly<Record<string, TerminalParser>> {
		return Object.fromEntries(this.terminals);
	}

	registerOutputBuilder(id: string, builder: RecipeOutputBuilder): void {
		this.assertOpen();
		if (this.outputBuilders.has(id) && this.outputBuilders.get(id) !== builder)
			throw new Error(`Value output builder '${id}' is already registered`);
		this.outputBuilders.set(id, builder);
	}

	listOutputBuilders(): Readonly<Record<string, RecipeOutputBuilder>> {
		return Object.fromEntries(this.outputBuilders);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		for (const resource of [...this.resources].reverse())
			await resource.close();
		this.resources.clear();
		this.backends.clear();
		this.terminals.clear();
		this.outputBuilders.clear();
	}

	private assertOpen(): void {
		if (this.closed)
			throw new Error(
				`Resource scope for '${this.ownerExtensionId}' is closed`,
			);
	}
}
