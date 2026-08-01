import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { Box, Text, useStdout } from "ink";
import { useMemo } from "react";
import { t } from "../lib/i18n";
import { StatusBadge } from "./StatusBadge";

interface WorkspaceStripProps {
	snapshot: WorkspaceSnapshot | null;
}

const NARROW_THRESHOLD = 60;

export function withActiveBranch(snapshot: WorkspaceSnapshot | null): {
	snapshot: WorkspaceSnapshot;
	branch: WorkspaceSnapshot["branches"][number];
} | null {
	if (!snapshot) return null;
	const branch =
		snapshot.branches.find((b) => b.branchId === snapshot.activeBranchId) ??
		snapshot.branches[0];
	if (!branch) return null;
	return { snapshot, branch };
}

export function WorkspaceStrip({ snapshot }: WorkspaceStripProps) {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const narrow = columns < NARROW_THRESHOLD;

	const derived = useMemo(() => withActiveBranch(snapshot), [snapshot]);
	if (!derived) return null;
	const { snapshot: ws, branch } = derived;

	const label = narrow
		? t("workspace.strip.short", {
				id: ws.workspaceId.slice(0, 12),
				name: branch.name,
				status: branch.status,
			})
		: t("workspace.strip.full", {
				id: ws.workspaceId.slice(0, 12),
				name: branch.name,
				status: branch.status,
				sup: branch.supportingCount,
				ref: branch.refutingCount,
			});

	return (
		<Box width="100%" height={1} paddingLeft={1} paddingRight={1}>
			<Text dimColor>▤ </Text>
			<Text dimColor>{label}</Text>
			<Text dimColor> </Text>
			<StatusBadge status={branch.status} />
		</Box>
	);
}
