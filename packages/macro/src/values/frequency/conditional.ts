import { escapeRegex } from "../regex";
import type { CadenceParseContext } from "./parse-context";

/**
 * Detects a conditional / PRN trigger at the front of the working text, strips
 * it (and any leading condition connector), records the reason, and pushes the
 * conditional-not-allowed diagnostic when the consumer policy forbids it.
 */
export function detectConditional<
	TAnchor extends string = string,
	TUnit extends string = string,
>(ctx: CadenceParseContext<TAnchor, TUnit>): void {
	for (const prnAlias of ctx.conditionalAliases) {
		const prnRegex = new RegExp(
			`(?<![\\p{L}\\p{N}])${escapeRegex(prnAlias)}(?![\\p{L}\\p{N}])(?:\\s+(?<reason>.+))?`,
			"iu",
		);
		const match = ctx.workingText.match(prnRegex);
		if (match) {
			ctx.isConditional = true;
			if (match.groups?.reason) {
				let reasonText = match.groups.reason.trim();
				for (const conn of ctx.conditionConnectors) {
					const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(conn);
					const connPattern = isSymbol
						? `^${escapeRegex(conn)}\\s*`
						: `^${escapeRegex(conn)}(?![\\p{L}\\p{N}])\\s*`;
					const connRegex = new RegExp(connPattern, "iu");
					if (connRegex.test(reasonText)) {
						reasonText = reasonText.replace(connRegex, "").trim();
						break;
					}
				}
				ctx.conditionReason = reasonText;
			}
			ctx.workingText = (
				ctx.workingText.slice(0, match.index) +
				ctx.workingText.slice((match.index ?? 0) + match[0].length)
			).trim();
			break;
		}
	}

	if (ctx.isConditional && ctx.policy.allowConditional === false) {
		ctx.diagnostics.push({
			code: "conditional_not_allowed",
			messageKey: "errors.frequencyConditionalNotAllowed",
		});
	}
}
