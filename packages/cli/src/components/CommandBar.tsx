import { Box, Text, useStdout } from "ink";
import { useMemo } from "react";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import { completionRemainder } from "../lib/editor/completion-state";
import { capSuggestions } from "../lib/editor/palette";
import { t } from "../lib/shared/i18n";

interface CommandBarProps {
	commandLine: string;
	suggestions: AutocompleteSuggestion[];
	suggestionIndex: number;
	highlightedCandidate: AutocompleteSuggestion | null;
	completionPrefix: string;
	/**
	 * Optional set of known canonical verbs (lowercased) from the rebuilt
	 * descriptor list. When provided, the no-match warning is suppressed for
	 * verbs that are genuinely known but produced no argument suggestions.
	 */
	knownVerbs?: Set<string>;
}

const NO_MATCH_THRESHOLD = 0;

export function CommandBar({
	commandLine,
	suggestions,
	suggestionIndex,
	highlightedCandidate,
	completionPrefix,
	knownVerbs,
}: CommandBarProps) {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;

	const ghost = useMemo(() => {
		if (!highlightedCandidate) return "";
		return completionRemainder(highlightedCandidate.verb, completionPrefix);
	}, [highlightedCandidate, completionPrefix]);

	const { visible, hidden } = useMemo(
		() => capSuggestions(columns, suggestions, suggestionIndex),
		[columns, suggestions, suggestionIndex],
	);

	const noMatch = useMemo(() => {
		if (suggestions.length > NO_MATCH_THRESHOLD) return null;
		// Use the raw (untrimmed) partial so trailing spaces are detected as
		// argument-space (V1 parity: suppress warning when a space is present).
		const rawPartial = commandLine.slice(1);
		if (!rawPartial.trim()) return null;
		const spaceIdx = rawPartial.indexOf(" ");
		if (spaceIdx >= 0) {
			return null;
		}
		const partial = rawPartial.trim();
		// Hardening: suppress the warning when the typed verb is genuinely known
		// from the rebuilt canonical vocabulary but produced no arg suggestions.
		if (knownVerbs?.has(partial.toLowerCase())) return null;
		return partial;
	}, [suggestions.length, commandLine, knownVerbs]);

	// Inline command-details line: the active verb suggestion's args + description.
	const details = useMemo(() => {
		const hasSpace = commandLine.includes(" ");
		if (!hasSpace) return null;
		const verb = commandLine.slice(1, commandLine.indexOf(" "));
		const activeVerb =
			highlightedCandidate?.kind === "verb"
				? highlightedCandidate
				: suggestions.find((s) => s.kind === "verb" && s.verb === verb);
		if (
			!activeVerb ||
			!activeVerb.argNames ||
			activeVerb.argNames.length === 0
		) {
			return null;
		}
		const parts: string[] = [];
		for (let i = 0; i < activeVerb.argNames.length; i++) {
			const name = activeVerb.argNames[i]!;
			const required = activeVerb.argsRequired?.[i];
			const hints = activeVerb.argHints?.[i];
			const label = required ? `${name}[req]` : `${name}[opt]`;
			const hintStr = hints && hints.length > 0 ? `(${hints.join("|")})` : "";
			parts.push(`${label}${hintStr}`);
		}
		const desc = activeVerb.descriptionKey
			? t(activeVerb.descriptionKey)
			: undefined;
		return { parts: parts.join(" "), desc, verb };
	}, [commandLine, suggestions, highlightedCandidate]);

	return (
		<Box width="100%" flexDirection="column">
			{visible.length > 0 && (
				<Box
					paddingLeft={1}
					paddingRight={1}
					flexDirection="row"
					gap={1}
					flexWrap="wrap"
				>
					{visible.map((s) => {
						const isActive =
							suggestionIndex >= 0 && s === suggestions[suggestionIndex];
						return (
							<Text
								key={`${s.kind}-${s.source}-${s.verb}-${s.argIndex}`}
								color={
									isActive ? undefined : s.kind === "arg" ? "magenta" : "cyan"
								}
								dimColor={!isActive}
								inverse={isActive}
								bold={isActive}
							>
								{s.kind === "arg" ? (
									<Text>
										<Text color={isActive ? undefined : "gray"}>
											({s.group}){" "}
										</Text>
										{s.verb}
									</Text>
								) : (
									<Text>
										<Text color={isActive ? undefined : "gray"}>
											({s.source[0]}){" "}
										</Text>
										{s.verb}
										{s.descriptionKey ? ` - ${t(s.descriptionKey)}` : ""}
										{s.argNames && s.argNames.length > 0
											? ` <${s.argNames.join("> <")}>`
											: ""}
									</Text>
								)}
							</Text>
						);
					})}
					{hidden > 0 && (
						<Text color="gray" bold>
							+{hidden} more
						</Text>
					)}
				</Box>
			)}
			{details && (
				<Box
					paddingLeft={1}
					paddingRight={1}
					flexWrap="wrap"
					flexDirection="row"
				>
					<Text color="yellow" bold>
						{details.verb}
					</Text>
					{details.desc && <Text color="white">: {details.desc} </Text>}
					<Text color="yellow"> {details.parts}</Text>
				</Box>
			)}
			{noMatch && (
				<Box paddingLeft={1} paddingRight={1}>
					<Text color="red" bold>
						{t("command.noMatch", { partial: noMatch })}
					</Text>
				</Box>
			)}
			<Box
				width="100%"
				height={1}
				borderStyle="single"
				borderTop={true}
				paddingLeft={1}
				paddingRight={1}
			>
				<Text bold>{commandLine}</Text>
				{ghost && <Text color="gray">{ghost}</Text>}
				<Text color="green">█</Text>
			</Box>
		</Box>
	);
}
