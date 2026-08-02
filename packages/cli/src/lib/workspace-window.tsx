import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { WorkspaceScreen } from "../components/WorkspaceScreen";
import type {
	CellSubmissionPlan,
	CommandCatalog,
	WindowDefinition,
} from "./cell-editor";

export interface WorkspaceWindowDeps {
	snapshot: WorkspaceSnapshot | null;
	sessionId: string;
	loading: boolean;
	error: string | null;
	focused: boolean;
	planSubmission: (text: string) => CellSubmissionPlan;
	onSubmitPlan: (plan: CellSubmissionPlan) => Promise<void>;
	commandCatalog: CommandCatalog;
	onFocusBranch: (branchRef: string) => Promise<void>;
	onClose: () => void;
}

/**
 * Workspace window definition, hosted by the same `WindowContainer`. It reuses
 * the shared primary region slot and renders the existing `WorkspaceScreen`.
 * This is the migration target from mounting `WorkspaceScreen` directly.
 */
export function workspaceWindow(deps: WorkspaceWindowDeps): WindowDefinition {
	return {
		type: "workspace",
		regions: () => [
			{
				slot: "primary",
				key: "workspace-primary",
				render() {
					return (
						<WorkspaceScreen
							snapshot={deps.snapshot}
							sessionId={deps.sessionId}
							loading={deps.loading}
							error={deps.error}
							focused={deps.focused}
							onClose={deps.onClose}
							planSubmission={deps.planSubmission}
							onSubmitPlan={deps.onSubmitPlan}
							commandCatalog={deps.commandCatalog}
							onFocusBranch={deps.onFocusBranch}
						/>
					);
				},
			},
		],
	};
}
