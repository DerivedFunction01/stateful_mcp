import { randomUUID } from "node:crypto";

export type ArtifactLifecycle =
	| "ephemeral"
	| "project"
	| "extension"
	| "external";

export interface RegisteredArtifact {
	readonly data: Uint8Array;
	readonly name: string;
	readonly mimeType: string;
	readonly expiresAt?: number;
	readonly lifecycle?: ArtifactLifecycle;
	readonly owner?: string;
	readonly projectId?: string;
}

export class ArtifactService {
	private readonly artifacts = new Map<string, RegisteredArtifact>();

	register(input: RegisteredArtifact): string {
		const token = randomUUID();
		this.artifacts.set(token, input);
		return token;
	}

	get(token: string): RegisteredArtifact | undefined {
		const artifact = this.artifacts.get(token);
		if (!artifact) return undefined;
		if (artifact.expiresAt !== undefined && artifact.expiresAt <= Date.now()) {
			this.artifacts.delete(token);
			return undefined;
		}
		return artifact;
	}

	remove(token: string): void {
		this.artifacts.delete(token);
	}
}
