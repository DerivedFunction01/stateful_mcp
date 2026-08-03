import type {
	PresentationFieldEmphasis,
	PresentationFieldKind,
} from "./field-types";

export interface PresentationFieldSpec {
	kind: PresentationFieldKind;
	label?: string;
	emphasis?: PresentationFieldEmphasis;
	visible?: boolean;
	fields?: Record<string, PresentationFieldSpec>;
	item?: PresentationFieldSpec;
}
export interface PresentationGroupPolicy {
	id: string;
	label: string;
	paths: string[];
}
export interface PresentationPolicy {
	targetSchema: string;
	titlePath?: string;
	fields: Record<string, PresentationFieldSpec>;
	groups?: PresentationGroupPolicy[];
	hiddenPaths?: string[];
}

export class PresentationPolicyRegistry {
	private readonly policies = new Map<string, PresentationPolicy>();
	register(policy: PresentationPolicy): void {
		this.policies.set(policy.targetSchema, policy);
	}
	get(targetSchema: string): PresentationPolicy | undefined {
		return this.policies.get(targetSchema);
	}
	list(): readonly PresentationPolicy[] {
		return [...this.policies.values()];
	}
}
