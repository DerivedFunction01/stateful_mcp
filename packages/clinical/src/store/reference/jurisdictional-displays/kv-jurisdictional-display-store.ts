import type { KvBackend } from "@stateful-mcp/core";
import type {
	JurisdictionalDisplay,
	JurisdictionalDisplayStore,
} from "./interfaces";

export class KvJurisdictionalDisplayStore
	implements JurisdictionalDisplayStore
{
	private readonly prefix = "jurisdictionalDisplay:";

	constructor(private readonly backend: KvBackend) {}

	private key(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): string {
		return `${this.prefix}${conceptId}::${jurisdictionId}::${source}`;
	}

	async get(
		conceptId: string,
		jurisdictionId: string,
		source?: string,
	): Promise<JurisdictionalDisplay | null> {
		const data = await this.backend.load();
		const value = data[this.key(conceptId, jurisdictionId, source ?? "local")];
		return (value as JurisdictionalDisplay | undefined) ?? null;
	}

	async list(): Promise<JurisdictionalDisplay[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as JurisdictionalDisplay);
	}

	async set(display: JurisdictionalDisplay): Promise<void> {
		await this.backend.set(
			this.key(display.conceptId, display.jurisdictionId, display.source),
			display,
		);
		await this.backend.save();
	}

	async delete(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): Promise<void> {
		await this.backend.delete(this.key(conceptId, jurisdictionId, source));
		await this.backend.save();
	}
}
