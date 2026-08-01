import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { Box, Text } from "ink";

interface CommandBarProps {
	commandLine: string;
	suggestions: AutocompleteSuggestion[];
	suggestionIndex: number;
}

export function CommandBar({
	commandLine,
	suggestions,
	suggestionIndex,
}: CommandBarProps) {
	return (
		<Box width="100%" flexDirection="column">
			{suggestions.length > 0 && (
				<Box paddingLeft={1} paddingRight={1} flexDirection="row" gap={1}>
					{suggestions.map((s, i) => (
						<Text key={`${s.source}-${s.verb}`} color="cyan" dimColor={i !== suggestionIndex} inverse={i === suggestionIndex}>
							<Text color="gray">[{s.source[0]}]</Text>
							{s.verb}
							{s.hasArgs ? " …" : ""}
						</Text>
					))}
				</Box>
			)}
			<Box width="100%" height={1} borderStyle="single" borderTop={true} paddingLeft={1} paddingRight={1}>
				<Text bold>{commandLine}</Text>
				<Text color="green">█</Text>
			</Box>
		</Box>
	);
}