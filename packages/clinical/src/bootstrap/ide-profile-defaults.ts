import type { ClinicalIdeProfile } from "../stores/profiles/profile-store";

export const DEFAULT_CLINICAL_IDE_PROFILE: ClinicalIdeProfile = {
	profileId: "cli-default-ide",
	name: "Default clinical IDE",
	sectionPalettes: {},
	favorites: [],
	keybindings: {},
	performance: {
		parseDebounceMs: 150,
	},
	historyPolicy: {
		includeMacroInvocations: true,
		includeRawCommands: true,
	},
};
