import { useEffect, useRef } from "react";
import { trapFocus } from "../lib/focus-trap";
import { useI18n } from "../lib/macro-i18n-provider";
import { Button } from "./ui/primitives";

export interface UnsavedChangesModalProps {
	readonly onKeepEditing: () => void;
	readonly onDiscard: () => void | Promise<void>;
	readonly onSave: () => void | Promise<void>;
}

export function UnsavedChangesModal({
	onKeepEditing,
	onDiscard,
	onSave,
}: UnsavedChangesModalProps) {
	const { t } = useI18n();
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	return (
		<div className="modal-overlay" role="presentation">
			<div
				ref={dialogRef}
				className="modal-card"
				role="dialog"
				aria-modal="true"
				aria-labelledby="navigation-guard-title"
				tabIndex={-1}
				onKeyDown={(event) => {
					trapFocus(event, dialogRef.current);
					if (event.key === "Escape") {
						event.preventDefault();
						onKeepEditing();
					}
				}}
			>
				<h2 id="navigation-guard-title">{t("settings.unsavedTitle")}</h2>
				<p>{t("settings.unsavedMessage")}</p>
				<div className="page-actions">
					<Button variant="ghost" onClick={onKeepEditing}>
						{t("settings.keepEditing")}
					</Button>
					<Button variant="ghost" onClick={onDiscard}>
						{t("settings.discard")}
					</Button>
					<Button variant="primary" onClick={onSave}>
						{t("settings.saveAndContinue")}
					</Button>
				</div>
			</div>
		</div>
	);
}
