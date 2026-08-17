import type { WindowLayoutStateManager } from "../layout/window-layout-state";
import type { WorkspacePersistenceParticipant, WorkspaceSaveRequest, WorkspaceSaveResult } from "../contributions/types";

export interface SaveSummary {
	readonly results: readonly { participantId: string; result: WorkspaceSaveResult }[];
	readonly blocked: boolean;
}

export class WorkspaceSaveCoordinator {
	private readonly participants = new Map<string, WorkspacePersistenceParticipant>();

	constructor(private readonly layout?: WindowLayoutStateManager) {}

	register(participant: WorkspacePersistenceParticipant): () => void {
		this.participants.set(participant.id, participant);
		return () => this.participants.delete(participant.id);
	}

	getParticipants(): readonly WorkspacePersistenceParticipant[] {
		return [...this.participants.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	async save(scope: "active" | "all", reason: WorkspaceSaveRequest["reason"] = "explicit"): Promise<SaveSummary> {
		const activeTabId = this.layout?.getSnapshot().activeTabId;
		const eligible = this.getParticipants().filter((participant) =>
			(scope === "all" || participant.scope === "workspace" || participant.tabId === activeTabId) &&
			(!participant.isDirty || participant.isDirty()),
		);
		const results: { participantId: string; result: WorkspaceSaveResult }[] = [];
		for (const participant of eligible) {
			const result = await participant.save({ reason, scope });
			results.push({ participantId: participant.id, result });
			if (result.status === "failed" || result.status === "needsConfirmation") break;
		}
		return { results, blocked: results.some(({ result }) => result.status === "failed" || result.status === "needsConfirmation") };
	}

	saveActive(reason: WorkspaceSaveRequest["reason"] = "explicit") { return this.save("active", reason); }
	saveAll(reason: WorkspaceSaveRequest["reason"] = "explicit") { return this.save("all", reason); }
	saveActiveAndClose() { return this.saveActive("close"); }
	saveAllAndQuit() { return this.saveAll("quit"); }
}
