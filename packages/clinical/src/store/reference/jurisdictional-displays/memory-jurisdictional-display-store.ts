import type {
	JurisdictionalDisplay,
	JurisdictionalDisplayStore,
} from "./interfaces";

export class MemoryJurisdictionalDisplayStore
	implements JurisdictionalDisplayStore
{
	private readonly displays = new Map<string, JurisdictionalDisplay>();

	private key(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): string {
		return `${conceptId}::${jurisdictionId}::${source}`;
	}

	async get(
		conceptId: string,
		jurisdictionId: string,
		source?: string,
	): Promise<JurisdictionalDisplay | null> {
		return (
			this.displays.get(
				this.key(conceptId, jurisdictionId, source ?? "local"),
			) ?? null
		);
	}

	async list(): Promise<JurisdictionalDisplay[]> {
		return Array.from(this.displays.values()).map((d) => ({ ...d }));
	}

	async set(display: JurisdictionalDisplay): Promise<void> {
		this.displays.set(
			this.key(display.conceptId, display.jurisdictionId, display.source),
			{ ...display },
		);
	}

	async delete(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): Promise<void> {
		this.displays.delete(this.key(conceptId, jurisdictionId, source));
	}
}
