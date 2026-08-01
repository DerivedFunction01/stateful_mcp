import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { Box, Text, useInput } from "ink";

interface WorkspaceScreenProps {
	snapshot: WorkspaceSnapshot | null;
	onClose: () => void;
}

export function WorkspaceScreen({ snapshot, onClose }: WorkspaceScreenProps) {
	useInput((_input, key) => {
		if (key.escape) {
			onClose();
		}
	});

	const branches = snapshot?.branches ?? [];

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box>
				<Text bold inverse>
					{" "}
					WORKSPACE{" "}
				</Text>
				<Text> — press Esc to close</Text>
			</Box>

			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				<Text bold underline>
					Branches ({branches.length})
				</Text>
				{branches.length === 0 && (
					<Box paddingLeft={2}>
						<Text color="gray">(no branches)</Text>
					</Box>
				)}
				{branches.map((b) => (
					<Box key={b.branchId} paddingLeft={2} flexDirection="column">
						<Box>
							<Text color="cyan">• </Text>
							<Text bold>{b.name}</Text>
							<Text color="gray">
								{" "}
								[{b.status}] supporting={b.supportingCount} refuting=
								{b.refutingCount}
							</Text>
						</Box>
						{b.hypothesisConcept && (
							<Box paddingLeft={4}>
								<Text color="gray">concept: {b.hypothesisConcept.display}</Text>
							</Box>
						)}
					</Box>
				))}
			</Box>

			<Box paddingTop={1} paddingLeft={1}>
				<Text color="gray">global facts: {snapshot?.globalFactCount ?? 0}</Text>
			</Box>

			{snapshot && (
				<Box paddingLeft={1}>
					<Text color="gray">workspaceId: {snapshot.workspaceId}</Text>
				</Box>
			)}
		</Box>
	);
}

export function createStubSnapshot(): WorkspaceSnapshot {
	return {
		workspaceId: "ws-stub",
		sourceSoapNoteId: "note-stub",
		activeBranchId: null,
		branches: [],
		globalFactCount: 0,
	};
}
