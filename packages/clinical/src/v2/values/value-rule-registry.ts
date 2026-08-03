import type { TypedValueKind } from "./typed-value";

export interface V2ValueRule {
	ruleId: string;
	targetSchema: string;
	targetPath: string;
	valueKind: TypedValueKind;
	patterns: readonly string[];
	caseInsensitive?: boolean;
	priority?: number;
	locale?: string;
}

export interface V2RuleMatch {
	rule: V2ValueRule;
	text: string;
	index: number;
	groups: Record<string, string | undefined>;
}

export class ValueRuleRegistry {
	private readonly profiles = new Map<string, Map<string, V2ValueRule>>();

	register(profileId: string, rules: readonly V2ValueRule[]): void {
		const profile = this.profiles.get(profileId) ?? new Map<string, V2ValueRule>();
		for (const rule of rules) {
			if (!rule.ruleId || !rule.targetSchema || !rule.targetPath) {
				throw new Error("A V2 value rule requires an ID, schema, and target path");
			}
			if (rule.patterns.length === 0) {
				throw new Error(`V2 value rule '${rule.ruleId}' must define a pattern`);
			}
			if (profile.has(rule.ruleId)) {
				throw new Error(`V2 value rule '${rule.ruleId}' is already registered`);
			}
			profile.set(rule.ruleId, { ...rule, patterns: [...rule.patterns] });
		}
		this.profiles.set(profileId, profile);
	}

	get(profileId: string, ruleId: string): V2ValueRule | null {
		return this.profiles.get(profileId)?.get(ruleId) ?? null;
	}

	list(profileId: string, targetPath?: string): V2ValueRule[] {
		return [...(this.profiles.get(profileId)?.values() ?? [])]
			.filter((rule) => targetPath === undefined || rule.targetPath === targetPath)
			.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.ruleId.localeCompare(right.ruleId));
	}

	match(profileId: string, targetPath: string, text: string): V2RuleMatch[] {
		const matches: V2RuleMatch[] = [];
		for (const rule of this.list(profileId, targetPath)) {
			for (const pattern of rule.patterns) {
				let expression: RegExp;
				try {
					expression = new RegExp(pattern, rule.caseInsensitive === false ? "g" : "gi");
				} catch {
					continue;
				}
				for (const match of text.matchAll(expression)) {
					matches.push({
						rule,
						text: match[0],
						index: match.index ?? 0,
						groups: match.groups ?? {},
					});
				}
			}
		}
		return matches.sort((left, right) => left.index - right.index || (right.rule.priority ?? 0) - (left.rule.priority ?? 0));
	}
}
