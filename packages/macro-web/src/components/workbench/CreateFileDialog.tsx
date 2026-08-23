import { AlertCircle, FilePlus2, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trapFocus } from "../../lib/focus-trap";
import { useI18n } from "../../lib/macro-i18n-provider";
import { cn } from "../../lib/utils";
import { Button, ModalOverlay, ModalSurface } from "../ui/primitives";

export interface CreateFileDialogProps {
	readonly open: boolean;
	readonly parentLabel?: string;
	readonly onSubmit: (name: string) => void | Promise<void>;
	readonly onCancel: () => void;
	readonly error?: string;
	readonly submitting?: boolean;
}

function validateName(
	name: string,
	t: ReturnType<typeof useI18n>["t"],
): string | undefined {
	const trimmed = name.trim();
	if (!trimmed) return t("editor.createFile.nameRequired");
	if (
		trimmed === "." ||
		trimmed === ".." ||
		trimmed.includes("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0")
	)
		return t("editor.createFile.invalidName");
	return undefined;
}

export function CreateFileDialog({
	open,
	parentLabel,
	onSubmit,
	onCancel,
	error,
	submitting = false,
}: CreateFileDialogProps) {
	const { t } = useI18n();
	const [name, setName] = useState("");
	const [localError, setLocalError] = useState<string | undefined>();
	const dialogRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		setName("");
		setLocalError(undefined);
		queueMicrotask(() => inputRef.current?.focus());
	}, [open]);

	if (!open) return null;

	const handleSubmit = async () => {
		const validationError = validateName(name, t);
		if (validationError) {
			setLocalError(validationError);
			return;
		}
		setLocalError(undefined);
		await onSubmit(name.trim());
	};

	const shownError = localError ?? error;

	return (
		<ModalOverlay role="presentation">
			<ModalSurface
				ref={dialogRef}
				className="modal-card create-file-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="create-file-dialog-title"
				tabIndex={-1}
				onKeyDown={(event) => {
					trapFocus(event, dialogRef.current);
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
			>
				<div className="modal-header-row">
					<h2 id="create-file-dialog-title" className="modal-title">
						<FilePlus2 size={18} />
						<span>{t("editor.createFile.title")}</span>
					</h2>
					<button
						type="button"
						className="icon-button"
						aria-label={t("editor.find.close")}
						onClick={onCancel}
					>
						<X size={16} />
					</button>
				</div>

				{parentLabel && (
					<p className="create-file-dialog__parent">
						{t("editor.createFile.parentLabel", { name: parentLabel })}
					</p>
				)}

				<form
					className="create-file-dialog__form"
					onSubmit={(event) => {
						event.preventDefault();
						void handleSubmit();
					}}
				>
					<label className="field">
						<span className="field-label">
							{t("editor.createFile.nameLabel")}
						</span>
						<input
							ref={inputRef}
							type="text"
							className={cn("input", shownError && "input-error")}
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={t("editor.createFile.namePlaceholder")}
							aria-invalid={Boolean(shownError)}
							disabled={submitting}
						/>
					</label>

					{shownError && (
						<div className="modal-error-banner" role="alert">
							<AlertCircle size={14} />
							<span>{shownError}</span>
						</div>
					)}

					<div className="modal-actions-bar">
						<div className="action-buttons-right">
							<Button
								type="button"
								variant="ghost"
								onClick={onCancel}
								disabled={submitting}
							>
								{t("editor.dialog.cancel")}
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={submitting || !name.trim()}
							>
								{submitting ? <Loader2 size={14} className="spin" /> : null}
								<span>{t("editor.createFile.create")}</span>
							</Button>
						</div>
					</div>
				</form>
			</ModalSurface>
		</ModalOverlay>
	);
}
