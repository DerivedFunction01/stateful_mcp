import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import type { DeduplicatedLine } from "../lib/workspace/assessment-workspace-view";
import { StatusBadge } from "./StatusBadge";

interface BranchDetailInspectorProps {
	snapshot: WorkspaceSnapshot | null;
	activeBranchId?: string;
	scratchpadPreview?: DeduplicatedLine[];
}

export function BranchDetailInspector({
	snapshot,
	activeBranchId,
	scratchpadPreview,
}: BranchDetailInspectorProps) {
	if (scratchpadPreview && scratchpadPreview.length > 0) {
		return (
			<Box flexDirection="column" padding={1} width="100%">
				<Box marginBottom={1}>
					<Text bold underline color="cyan">
						LIVE SCRATCHPAD RESOLUTION
					</Text>
				</Box>
				<Box flexDirection="column">
					{scratchpadPreview.map(({ parsed, mergedCount }, idx) => (
						<Box key={idx} flexDirection="column" marginBottom={1}>
							<Box>
								<Text color="cyan">{idx + 1}. </Text>
								<Text color="magenta">[{parsed.macroId ?? "implicit-active"}] </Text>
								<Text color="yellow">[{parsed.rawInput}] </Text>
							</Box>
							<Box paddingLeft={1}>
								<Text>➜ {parsed.conceptDisplay} </Text>
								<Text color="gray">| STATUS: </Text>
								<StatusBadge status={parsed.status} />
								{mergedCount > 1 && (
									<Text color="magenta"> · (merged {mergedCount})</Text>
								)}
							</Box>
							{parsed.supportingFindings.map((f, fIdx) => (
								<Box key={`supp-${fIdx}`} paddingLeft={2}>
									<Text color="green">├─ + {f.display}</Text>
								</Box>
							))}
							{parsed.refutingFindings.map((f, fIdx) => (
								<Box key={`refut-${fIdx}`} paddingLeft={2}>
									<Text color="red">└─ ── {f.display}</Text>
								</Box>
							))}
						</Box>
					))}
				</Box>
			</Box>
		);
	}

	if (!snapshot) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="gray">No workspace snapshot available</Text>
			</Box>
		);
	}

	const branchId = activeBranchId ?? snapshot.activeBranchId;
	const branch = snapshot.branches.find((b) => b.branchId === branchId);

	if (!branch) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text bold underline color="cyan">
					BRANCH INSPECTOR
				</Text>
				<Text color="gray">Select a branch to inspect details.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1} width="100%">
			<Box marginBottom={1}>
				<Text bold underline color="cyan">
					BRANCH INSPECTOR
				</Text>
			</Box>
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text bold color="green">
						{branch.name}
					</Text>
					<Text color="gray"> (ID: {branch.branchId})</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="gray">Status: </Text>
					<StatusBadge status={branch.status} />
				</Box>
			</Box>

			{branch.hypothesisConcept && (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Hypothesis:</Text>
					<Box paddingLeft={1}>
						<Text color="cyan">◆ {branch.hypothesisConcept.display}</Text>
					</Box>
					{branch.hypothesisConcept.conceptId && (
						<Box paddingLeft={1}>
							<Text dimColor>Code: {branch.hypothesisConcept.conceptId}</Text>
						</Box>
					)}
				</Box>
			)}

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					Supporting Evidence ({branch.supportingConcepts.length}):
				</Text>
				{branch.supportingConcepts.length === 0 ? (
					<Box paddingLeft={1}>
						<Text dimColor>None recorded</Text>
					</Box>
				) : (
					branch.supportingConcepts.map((c) => (
						<Box key={c.conceptId ?? c.display} paddingLeft={1}>
							<Text color="green">+ {c.display ?? c.conceptId}</Text>
						</Box>
					))
				)}
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Refuting Evidence ({branch.refutingConcepts.length}):</Text>
				{branch.refutingConcepts.length === 0 ? (
					<Box paddingLeft={1}>
						<Text dimColor>None recorded</Text>
					</Box>
				) : (
					branch.refutingConcepts.map((c) => (
						<Box key={c.conceptId ?? c.display} paddingLeft={1}>
							<Text color="red">– {c.display ?? c.conceptId}</Text>
						</Box>
					))
				)}
			</Box>

			<Box
				flexDirection="column"
				marginTop={1}
				borderStyle="single"
				borderColor="gray"
			>
				<Text bold dimColor>
					Context Actions (Macro / Form):
				</Text>
				<Text dimColor>:hypothesis [code] "[title]"</Text>
				<Text dimColor>:evidence [concept] [support|refute]</Text>
				<Text dimColor>:complete [winning_branch]</Text>
			</Box>
		</Box>
	);
}
