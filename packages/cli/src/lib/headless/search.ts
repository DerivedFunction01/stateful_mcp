import type { MacroExecutionAttempt } from "@stateful-mcp/macro";
import type { HeadlessNotebookState } from "./notebook-state";

export interface HeadlessSearchResult {
	scope:
		| "draft"
		| "history"
		| "macro"
		| "argument"
		| "expression"
		| "diagnostic";
	tabId?: string;
	eventId?: string;
	field: string;
	start?: number;
	end?: number;
	snippet: string;
}

export function searchHeadless(
	state: HeadlessNotebookState,
	events: readonly { eventId: string; payload: MacroExecutionAttempt }[] = [],
	query: string,
	scope?: HeadlessSearchResult["scope"],
): HeadlessSearchResult[] {
	const results: HeadlessSearchResult[] = [];
	const needle = query;
	for (const tab of state.tabs) {
		if (scope && scope !== "draft") continue;
		addResult(results, "draft", tab.tabId, undefined, "text", tab.text, needle);
		addResult(
			results,
			"draft",
			tab.tabId,
			undefined,
			"title",
			tab.title,
			needle,
		);
	}
	for (const event of events) {
		const attempt = event.payload;
		if (!scope || scope === "history" || scope === "macro")
			addResult(
				results,
				scope === "macro" ? "macro" : "history",
				undefined,
				event.eventId,
				"macroId",
				attempt.macroId,
				needle,
			);
		if (!scope || scope === "history")
			addResult(
				results,
				"history",
				undefined,
				event.eventId,
				"authoredText",
				attempt.authoredText,
				needle,
			);
		if (!scope || scope === "macro") {
			addResult(
				results,
				"macro",
				undefined,
				event.eventId,
				"macroName",
				attempt.payload?.macro.name ?? "",
				needle,
			);
			addResult(
				results,
				"macro",
				undefined,
				event.eventId,
				"macroVersion",
				String(attempt.macroVersion),
				needle,
			);
		}
		if (!scope || scope === "diagnostic")
			for (const diagnostic of attempt.diagnostics)
				addResult(
					results,
					"diagnostic",
					undefined,
					event.eventId,
					"diagnostic",
					diagnostic.message,
					needle,
				);
		if (!scope || scope === "argument")
			for (const argument of attempt.payload?.arguments ?? []) {
				addResult(
					results,
					"argument",
					undefined,
					event.eventId,
					`${argument.argumentId}.rawText`,
					argument.rawText ?? "",
					needle,
				);
				addResult(
					results,
					"argument",
					undefined,
					event.eventId,
					`${argument.argumentId}.value`,
					JSON.stringify(argument.value) ?? "",
					needle,
				);
			}
		if (!scope || scope === "expression")
			for (const argument of attempt.payload?.arguments ?? []) {
				addResult(
					results,
					"expression",
					undefined,
					event.eventId,
					`${argument.argumentId}.candidateId`,
					argument.match?.sourceId ?? "",
					needle,
				);
				addResult(
					results,
					"expression",
					undefined,
					event.eventId,
					`${argument.argumentId}.backendId`,
					argument.match?.backendId ?? "",
					needle,
				);
			}
	}
	return results.sort(
		(left, right) =>
			left.scope.localeCompare(right.scope) ||
			(left.tabId ?? left.eventId ?? "").localeCompare(
				right.tabId ?? right.eventId ?? "",
			) ||
			left.field.localeCompare(right.field) ||
			(left.start ?? -1) - (right.start ?? -1),
	);
}

function addResult(
	results: HeadlessSearchResult[],
	scope: HeadlessSearchResult["scope"],
	tabId: string | undefined,
	eventId: string | undefined,
	field: string,
	value: string,
	query: string,
): void {
	const start = value.indexOf(query);
	if (start < 0) return;
	results.push({
		scope,
		tabId,
		eventId,
		field,
		start,
		end: start + query.length,
		snippet: value.slice(Math.max(0, start - 24), start + query.length + 24),
	});
}
