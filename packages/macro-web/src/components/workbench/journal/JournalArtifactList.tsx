import type { MacroArtifactDescriptorDto } from "@stateful-mcp/macro-protocol";
import {
	Download,
	FileCode2,
	FileSpreadsheet,
	FileText,
	FolderPlus,
} from "lucide-react";
import type { I18nFn } from "./journal-types";
import { formatBytes } from "./journal-utils";

export type JournalArtifactListProps = {
	readonly artifacts: readonly MacroArtifactDescriptorDto[];
	readonly t: I18nFn;
	readonly onSaveArtifact: (a: MacroArtifactDescriptorDto) => void;
};

export function JournalArtifactList({
	artifacts,
	t,
	onSaveArtifact,
}: JournalArtifactListProps) {
	return (
		<div className="inspector-section">
			<span className="inspector-label">{t("journal.artifact.title")}</span>
			<div className="journal-artifact-list">
				{artifacts.map((a) => {
					const isTable =
						a.name.endsWith(".csv") ||
						a.name.endsWith(".parquet") ||
						a.name.endsWith(".xlsx");
					const isCode =
						a.name.endsWith(".json") ||
						a.name.endsWith(".ts") ||
						a.name.endsWith(".sql");

					return (
						<div key={a.id} className="journal-artifact-card">
							<div className="journal-artifact-info">
								{isTable ? (
									<FileSpreadsheet size={14} className="artifact-icon" />
								) : isCode ? (
									<FileCode2 size={14} className="artifact-icon" />
								) : (
									<FileText size={14} className="artifact-icon" />
								)}
								<div className="artifact-name-group">
									<strong className="artifact-name">{a.name}</strong>
									{a.sizeBytes !== undefined && (
										<span className="artifact-size">
											({formatBytes(a.sizeBytes)})
										</span>
									)}
								</div>
							</div>
							<div className="artifact-card-actions">
								<button
									type="button"
									className="artifact-btn"
									title={t("journal.artifact.save")}
									onClick={() => onSaveArtifact(a)}
								>
									<FolderPlus size={12} />
									<span>{t("journal.artifact.save")}</span>
								</button>
								{a.downloadUrl && (
									<a
										href={a.downloadUrl}
										download={a.name}
										className="artifact-btn"
										title={t("journal.artifact.download")}
									>
										<Download size={12} />
									</a>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
