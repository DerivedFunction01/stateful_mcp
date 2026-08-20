import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import { Command } from "lucide-react";
import type { TransportState } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { KeymapShortcuts } from "./KeymapShortcuts";
import { Badge, Card } from "./ui/primitives";

export interface HostRouteProps {
	readonly snapshot?: WorkspaceSnapshot;
	readonly transport: TransportState;
}

export function HostRoute({ snapshot, transport }: HostRouteProps) {
	const { t } = useI18n();

	return (
		<div className="host-route">
			<div className="page-header">
				<div>
					<span className="eyebrow">{t("gallery.eyebrow")}</span>
					<h1>
						<Command size={24} />
						{t("app.host")}
					</h1>
					<p>{t("host.description")}</p>
				</div>
			</div>
			<Card title={t("host.transport")}>
				<div className="session-lines">
					<span>
						{t("host.workspace")}{" "}
						<strong>{snapshot?.workspaceId ?? t("common.loading")}</strong>
					</span>
					<span>
						{t("host.session")}{" "}
						<strong>{snapshot?.sessionId ?? t("common.loading")}</strong>
					</span>
					<span>
						{t("host.profile")}{" "}
						<strong>
							{snapshot?.profile.displayName ?? t("common.loading")}
						</strong>
					</span>
					<span>
						{t("host.transport")}{" "}
						<Badge tone={transport === "connected" ? "success" : "warning"}>
							{transport}
						</Badge>
					</span>
					<span>
						{t("host.protocol")} <strong>v1</strong>
					</span>
					<span>
						{t("host.websocket")}{" "}
						<strong>
							{snapshot
								? `${snapshot.revision} ${t("status.diagnostics")}`
								: t("common.loading")}
						</strong>
					</span>
				</div>
			</Card>
			{snapshot?.keymap ? (
				<Card title={t("palette.keymapHint")}>
					<KeymapShortcuts
						keymap={snapshot.keymap}
						commands={snapshot.commands}
					/>
				</Card>
			) : null}
		</div>
	);
}
