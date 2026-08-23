import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface PendingCloseDocument {
	readonly groupId?: string;
	readonly documentId: string;
	readonly title: string;
	readonly textRevision: number;
	readonly filePath?: string;
}

export interface CloseDirtyDialogProps {
	readonly target: PendingCloseDocument | null;
	readonly onSaveAndClose: (target: PendingCloseDocument) => void;
	readonly onDiscardAndClose: (target: PendingCloseDocument) => void;
	readonly onCancel: () => void;
}

export function CloseDirtyDialog({
	target,
	onSaveAndClose,
	onDiscardAndClose,
	onCancel,
}: CloseDirtyDialogProps) {
	const { t } = useI18n();

	return (
		<Dialog.Root
			open={target !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay className="dialog-backdrop" />
				<Dialog.Content className="dialog-modal close-dirty-dialog">
					<div className="close-dirty-dialog__header">
						<div className="close-dirty-dialog__icon" aria-hidden="true">
							<AlertCircle size={22} />
						</div>
						<div className="close-dirty-dialog__text">
							<Dialog.Title className="close-dirty-dialog__title">
								{t("editor.dialog.closeDirtyTitle", {
									title: target?.title ?? "",
								})}
							</Dialog.Title>
							<Dialog.Description className="close-dirty-dialog__description">
								{t("editor.dialog.closeDirtyDescription")}
							</Dialog.Description>
						</div>
					</div>

					<div className="close-dirty-dialog__actions">
						<button
							type="button"
							className="close-dirty-dialog__button close-dirty-dialog__button--cancel"
							onClick={onCancel}
						>
							{t("editor.dialog.cancel")}
						</button>
						<button
							type="button"
							className="close-dirty-dialog__button close-dirty-dialog__button--discard"
							onClick={() => target && onDiscardAndClose(target)}
						>
							{t("editor.dialog.discard")}
						</button>
						<button
							type="button"
							className="close-dirty-dialog__button close-dirty-dialog__button--save"
							onClick={() => target && onSaveAndClose(target)}
						>
							{t("editor.dialog.save")}
						</button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
