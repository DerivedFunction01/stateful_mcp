export type ProseTemplateUsageKind =
	| "root_confirmed"
	| "slot_override_confirmed";

export interface ProseTemplateUsage {
	templateId: string;
	usageKind: ProseTemplateUsageKind;
	sessionId: string;
	workspaceId?: string;
	rootTemplateId?: string;
	slotKey?: string;
	count: number;
	firstUsedAt: string;
	lastUsedAt: string;
}

export interface ProseTemplateUsageStore {
	recordUse(input: {
		templateId: string;
		usageKind: ProseTemplateUsageKind;
		sessionId: string;
		workspaceId?: string;
		rootTemplateId?: string;
		slotKey?: string;
		usedAt?: string;
	}): Promise<void>;
	listRanked(input: {
		sessionId?: string;
		workspaceId?: string;
		usageKind?: ProseTemplateUsageKind;
		order?: "mru" | "lru" | "most_used";
		limit?: number;
	}): Promise<ProseTemplateUsage[]>;
	removeTemplate(templateId: string): Promise<void>;
}
