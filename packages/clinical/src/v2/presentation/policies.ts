import type { V2PresentationFieldEmphasis, V2PresentationFieldKind } from "./field-types";

export interface V2PresentationFieldSpec { kind: V2PresentationFieldKind; label?: string; emphasis?: V2PresentationFieldEmphasis; visible?: boolean; fields?: Record<string, V2PresentationFieldSpec>; item?: V2PresentationFieldSpec; }
export interface V2PresentationGroupPolicy { id: string; label: string; paths: string[]; }
export interface V2PresentationPolicy { targetSchema: string; titlePath?: string; fields: Record<string, V2PresentationFieldSpec>; groups?: V2PresentationGroupPolicy[]; hiddenPaths?: string[]; }

export class V2PresentationPolicyRegistry {
	private readonly policies = new Map<string, V2PresentationPolicy>();
	register(policy: V2PresentationPolicy): void { this.policies.set(policy.targetSchema, policy); }
	get(targetSchema: string): V2PresentationPolicy | undefined { return this.policies.get(targetSchema); }
	list(): readonly V2PresentationPolicy[] { return [...this.policies.values()]; }
}
