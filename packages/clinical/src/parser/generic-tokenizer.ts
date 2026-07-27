import type {
	AttributeParserRule,
	ParserDictionaryRule,
} from "../store/interfaces";

import { getCompiledRegex } from "./_compiled-regex";
import {
	NamedGroupContractError,
	validateNamedGroups,
} from "./utils/named-group-validator";

export interface GenericToken {
	anchorText: string;
	namedGroups: Record<string, Record<string, string | undefined>>;
	attributes: Record<string, string>;
}

export class GenericTokenizer {
	static tokenize(
		content: string,
		attributeRules: AttributeParserRule[] = [],
		evaluatorRules: ParserDictionaryRule[] = [],
	): GenericToken {
		let workingText = content;
		const namedGroups: Record<string, Record<string, string | undefined>> = {};
		const attributes: Record<string, string> = {};

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(workingText);
				if (match && match.groups) {
					try {
						validateNamedGroups(match.groups, rule.namedGroupContract);
					} catch (e) {
						if (e instanceof NamedGroupContractError) continue;
						throw e;
					}
					namedGroups[rule.targetField] = { ...match.groups };
					workingText = workingText.replace(match[0], " ");
				}
			}
		}

		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = getCompiledRegex(pattern, flags);
				if (regex.test(workingText)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = getCompiledRegex(pattern, flags);
				workingText = workingText.replace(regex, " ");
			}
		}

		workingText = workingText.replace(/\s+/g, " ").trim();

		return {
			anchorText: workingText,
			namedGroups,
			attributes,
		};
	}
}
