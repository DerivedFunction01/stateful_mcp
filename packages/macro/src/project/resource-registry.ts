import type { MacroProjectResourceReference } from "./contracts";

/** Metadata registered by the host for a project-owned resource kind. */
export interface ProjectResourceRegistration {
	readonly kind: string;
	readonly extensionId?: string;
	readonly schemaVersion: number;
	readonly migrationParticipantId?: string;
}

/**
 * Core-owned registry for project resources. Extensions can describe ownership
 * and migration responsibility, but cannot replace the host's resource store.
 */
export class ProjectResourceRegistry {
	private readonly registrations = new Map<
		string,
		ProjectResourceRegistration
	>();

	register(registration: ProjectResourceRegistration): void {
		if (!registration.kind.trim()) throw new Error("Resource kind is required");
		if (
			!Number.isInteger(registration.schemaVersion) ||
			registration.schemaVersion < 1
		) {
			throw new Error(
				`Invalid schema version for resource '${registration.kind}'`,
			);
		}
		const existing = this.registrations.get(registration.kind);
		if (existing && existing.extensionId !== registration.extensionId) {
			throw new Error(
				`Resource kind '${registration.kind}' is already registered`,
			);
		}
		this.registrations.set(registration.kind, registration);
	}

	get(kind: string): ProjectResourceRegistration | undefined {
		return this.registrations.get(kind);
	}

	list(): readonly ProjectResourceRegistration[] {
		return [...this.registrations.values()].sort((a, b) =>
			a.kind.localeCompare(b.kind),
		);
	}

	validateReferences(
		references: readonly MacroProjectResourceReference[],
	): readonly string[] {
		const errors: string[] = [];
		for (const reference of references) {
			const registration = this.get(reference.kind);
			if (!registration) {
				errors.push(`Unknown resource kind '${reference.kind}'`);
				continue;
			}
			const version = reference.metadata?.schemaVersion;
			if (version !== undefined && version !== registration.schemaVersion) {
				errors.push(
					`Resource '${reference.resourceId}' uses schema version ${String(version)}; expected ${registration.schemaVersion}`,
				);
			}
		}
		return errors;
	}
}
