import type { DirectCommandVerb } from "../commands/command-syntax-profile";

export const DEFAULT_DIFFERENTIAL_ACTION_MACRO_MAPPINGS: Readonly<
	Partial<Record<DirectCommandVerb, string>>
> = {
	branch: "v2-differential-active-1",
	confirm: "v2-differential-confirm-1",
	rule_out: "v2-differential-rule-out-1",
	suspend: "v2-differential-suspend-1",
	close: "v2-differential-close-1",
};
