import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { completionRemainder } from "../lib/completion-state";

interface CommandBarProps {
	commandLine: string;
	suggestions: AutocompleteSuggestion[];
	suggestionIndex: number;
	highlightedCandidate: AutocompleteSuggestion | null;
	completionPrefix: string;
}

export function CommandBar({
	commandLine,
	suggestions,
	suggestionIndex,
	highlightedCandidate,
	completionPrefix,
}: CommandBarProps) {
	const ghost = useMemo(() => {
		if (!highlightedCandidate) return "";
		return completionRemainder(highlightedCandidate.verb, completionPrefix);
	}, [highlightedCandidate, completionPrefix]);

	const argHints = useMemo(() => {
		if (!commandLine.includes(" ")) return null;
		const verb = commandLine.slice(1, commandLine.indexOf(" "));
		const match = suggestions.find((s) => s.verb === verb);
		if (!match || !match.argNames) return null;
		const parts: string[] = [];
		for (let i = 0; i < match.argNames.length; i++) {
			const name = match.argNames[i]!;
			const required = match.argsRequired?.[i];
			const hints = match.argHints?.[i];
			const label = required ? `${name}[req]` : `${name}[opt]`;
			const hintStr = hints && hints.length > 0 ? `(${hints.join("|")})` : "";
			parts.push(`${label}${hintStr}`);
		}
		return parts.join(" ");
	}, [commandLine, suggestions]);

	return (
		<Box width="100%" flexDirection="column">
			{suggestions.length > 0 && (
				<Box
					paddingLeft={1}
					paddingRight={1}
					flexDirection="row"
					gap={1}
					flexWrap="wrap"
				>
					{suggestions.map((s, i) => (
						<Text
							key={`${s.source}-${s.verb}`}
							color="cyan"
							dimColor={i !== suggestionIndex}
							inverse={i === suggestionIndex}
						>
							<Text color="gray">[{s.source[0]}]</Text>
							{s.verb}
							{s.argNames && s.argNames.length > 0
								? ` (${s.argNames.join(" ")})`
								: ""}
						</Text>
					))}
				</Box>
			)}
			{argHints && (
				<Box paddingLeft={1} paddingRight={1}>
					<Text color="yellow">{argHints}</Text>
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
