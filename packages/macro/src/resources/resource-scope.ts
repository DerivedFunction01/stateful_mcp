import type { ExpressionBackend } from "../contracts/backends";
import type { DictionaryResource } from "./contracts";

export class ResourceScope {
	private readonly resources = new Set<DictionaryResource>();
	private readonly backends = new Map<string, ExpressionBackend>();
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
		this.backends.set(id, backend);
	}

	getBackend(id: string): ExpressionBackend | undefined {
		return this.backends.get(id);
	}

	listBackends(): Readonly<Record<string, ExpressionBackend>> {
		return Object.fromEntries(this.backends);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		for (const resource of [...this.resources].reverse())
			await resource.close();
		this.resources.clear();
		this.backends.clear();
	}

	private assertOpen(): void {
		if (this.closed)
			throw new Error(
				`Resource scope for '${this.ownerExtensionId}' is closed`,
			);
	}
}
