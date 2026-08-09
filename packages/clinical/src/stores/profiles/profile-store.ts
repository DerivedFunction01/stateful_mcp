export type UnifiedProfileKind =
	| "command"
	| "numerical"
	| "value"
	| "macro"
	| "dictionary"
	| "ide";

export interface ScratchpadCellTemplate {
	pinnedMacroIds: readonly string[];
	explicitPins?: boolean;
}

export interface MacroFavorite {
	favoriteId: string;
	macroId: string;
	profileId?: string;
	label?: string;
	description?: string;
	order: number;
	targetMode: "configured" | "active_slot" | "unbound";
}

export interface ClinicalIdeProfile {
	profileId: string;
	name: string;
	macroProfileId?: string;
	sectionPalettes: Record<string, string[]>;
	scratchpadDefaults?: Record<string, ScratchpadCellTemplate[]>;
	favorites: MacroFavorite[];
	keybindings: Record<string, string>;
	performance: {
		parseDebounceMs: number;
	};
	historyPolicy: {
		includeMacroInvocations: boolean;
		includeRawCommands: boolean;
		maxEntries?: number;
	};
}

export interface UnifiedProfileRecord {
	profileId: string;
	kind: UnifiedProfileKind;
	isDefault?: boolean;
	active?: boolean;
	metadata?: Record<string, unknown>;
	payload: unknown;
}

export interface UnifiedProfileStore {
	get(profileId: string): Promise<UnifiedProfileRecord | null>;
	list(): Promise<UnifiedProfileRecord[]>;
	set(profile: UnifiedProfileRecord): Promise<void>;
	delete(profileId: string): Promise<void>;
}
