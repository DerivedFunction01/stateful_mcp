import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { getCommandMacroAutocomplete } from "@stateful-mcp/clinical/notebook/command-macro-autocomplete";
import { useEffect, useMemo, useRef, useState } from "react";
import { deriveCompletionSession } from "../lib/editor/completion-state";

export function useEngineCompletion({
	mode,
	commandLine,
	catalog,
	context,
	engine,
	staticCandidates,
	macroStore,
	macroContext,
}: {
	mode: "NORMAL" | "INSERT" | "COMMAND" | "MACRO" | "VISUAL";
	commandLine: string;
	catalog: any;
	context: any;
	engine: any;
	staticCandidates: AutocompleteSuggestion[];
	macroStore?: { list: (context?: any) => Promise<any[]> };
	macroContext?: { personnelId?: string; profileId?: string };
}) {
	const [loading, setLoading] = useState(false);
	const [engineCandidates, setEngineCandidates] = useState<
		AutocompleteSuggestion[]
	>([]);
	const lastRequestRef = useRef<string | null>(null);

	useEffect(() => {
		if (mode === "MACRO") {
			if (!macroStore) { setLoading(false); setEngineCandidates([]); return; }
			const prefix = commandLine;
			lastRequestRef.current = prefix;
			setLoading(true);
			const timer = setTimeout(async () => {
				try {
					const suggestions = await getCommandMacroAutocomplete(prefix, macroStore as any, macroContext);
					if (lastRequestRef.current === prefix) setEngineCandidates(suggestions);
				} catch { if (lastRequestRef.current === prefix) setEngineCandidates([]); }
				finally { if (lastRequestRef.current === prefix) setLoading(false); }
			}, 150);
			return () => clearTimeout(timer);
		}
		if (mode !== "COMMAND") {
			setLoading(false);
			setEngineCandidates([]);
			lastRequestRef.current = null;
			return;
		}

		const session = deriveCompletionSession(commandLine);
		if (!session || session.mode !== "arg") {
			setLoading(false);
			setEngineCandidates([]);
			lastRequestRef.current = null;
			return;
		}

		// Find the command descriptor to see if the current argument accepts clinical vocabulary
		const descriptors = catalog.getDescriptors(context);
		const desc = descriptors.find(
			(d: any) =>
				d.verb.toLowerCase() === session.verb.toLowerCase() ||
				d.aliases?.some(
					(a: string) => a.toLowerCase() === session.verb.toLowerCase(),
				),
		);
		const arg = desc?.args?.[session.argIndex];
		const acceptsClinical =
			arg &&
			[
				"section",
				"schema",
				"concept",
				"tag",
				"macro",
				"term",
				"vocabulary",
				"value",
				"args",
				"arg",
			].includes(arg.name.toLowerCase());

		if (!acceptsClinical || !engine) {
			setLoading(false);
			setEngineCandidates([]);
			lastRequestRef.current = null;
			return;
		}

		const prefix = session.prefix;
		lastRequestRef.current = prefix;
		setLoading(true);

		const timer = setTimeout(async () => {
			try {
				const suggestions = await engine.suggestAutocomplete(prefix);
				if (lastRequestRef.current === prefix) {
					const mapped: AutocompleteSuggestion[] = suggestions.map(
						(s: any) => ({
							verb: s.verb ?? s.name ?? s.code ?? String(s),
							group: s.group ?? "engine",
							source: "cell" as const,
							hasArgs: false,
							kind: "arg" as const,
							descriptionKey: s.descriptionKey,
						}),
					);
					setEngineCandidates(mapped);
				}
			} catch (e) {
				if (lastRequestRef.current === prefix) {
					setEngineCandidates([]);
				}
			} finally {
				if (lastRequestRef.current === prefix) {
					setLoading(false);
				}
			}
		}, 150);

		return () => {
			clearTimeout(timer);
		};
	}, [mode, commandLine, catalog, context, engine, macroStore, macroContext]);

	const mergedCandidates = useMemo(() => {
		const seen = new Set<string>();
		const result: AutocompleteSuggestion[] = [];

		for (const cand of staticCandidates) {
			const key = cand.verb.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(cand);
			}
		}

		for (const cand of engineCandidates) {
			const key = cand.verb.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(cand);
			}
		}

		return result;
	}, [staticCandidates, engineCandidates]);

	return {
		loading,
		engineCandidates,
		mergedCandidates,
	};
}
