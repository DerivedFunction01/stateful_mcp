import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import type { SessionState } from "../hooks/useSession";
import { useWorkspace } from "../hooks/useWorkspace";

export function Workspace({
	session,
	onBack,
}: {
	session: SessionState;
	onBack(): void;
}) {
	const { exit } = useApp();
	const workspace = useWorkspace({
		showWorkspace: true,
		sessionId: session.sessionId,
		soapNoteId: session.sessionId,
		session,
	});
	const [command, setCommand] = useState("");

	useInput((input, key) => {
		if (key.escape) return onBack();
		if (key.ctrl && input === "c") return exit();
		if (key.return) {
			const value = command.trim();
			if (value)
				void workspace.executeCommand(
					value.startsWith(":") ? value : `:${value}`,
				);
			setCommand("");
			return;
		}
		if (key.backspace || key.delete) setCommand((value) => value.slice(0, -1));
		else if (input) setCommand((value) => value + input);
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>Workspace {workspace.snapshot?.workspaceId ?? "loading"}</Text>
			{workspace.loading && <Text>Loading workspace...</Text>}
			{workspace.error && <Text color="red">{workspace.error}</Text>}
			{workspace.snapshot?.branches.map((branch) => (
				<Text key={branch.branchId}>
					{branch.branchId === workspace.snapshot?.activeBranchId ? "*" : " "}{" "}
					{branch.name} [{branch.status}]{" "}
					{branch.hypothesisConcept?.display ?? ""}
				</Text>
			))}
			<Text dimColor>
				{workspace.snapshot?.globalFacts.length ?? 0} global facts
			</Text>
			<Text color="cyan">:{command}</Text>
			<Text dimColor>Enter executes a command. Esc returns to notebook.</Text>
		</Box>
	);
}
