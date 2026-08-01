import type { Laterality } from "../../schemas/shared";
import type { AttributeParserRule } from "../../store/interfaces";

export interface AnatomyCandidate {
	raw: string;
	laterality?: Laterality;
	depthIndex?: number;
	tokenStart: number;
	tokenEnd: number;
}

/** Extracts anatomy candidates only from profile-provided attribute rules. */
export class AnatomyTokenizer {
	static tokenize(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): AnatomyCandidate[] {
		const candidates: AnatomyCandidate[] = [];
		for (const rule of attributeRules) {
			if (
				rule.targetField !== "anatomy" &&
				rule.targetField !== "anatomyLocations"
			)
				continue;
			for (const pattern of rule.regexPatterns) {
				let regex: RegExp;
				try {
					regex = new RegExp(
						pattern,
						`${rule.isCaseInsensitive !== false ? "i" : ""}g`,
					);
				} catch {
					continue;
				}
				for (const match of text.matchAll(regex)) {
					const groups = match.groups ?? {};
					const raw = groups.anatomy ?? groups.raw ?? match[0];
					if (!raw) continue;
					const start = match.index ?? 0;
					const depth =
						groups.depthIndex === undefined
							? undefined
							: Number(groups.depthIndex);
					candidates.push({
						raw,
						laterality: groups.laterality as Laterality | undefined,
						depthIndex: Number.isFinite(depth) ? depth : undefined,
						tokenStart: start,
						tokenEnd: start + match[0].length,
					});
				}
			}
		}
		return candidates.sort((a, b) => a.tokenStart - b.tokenStart);
	}
}
