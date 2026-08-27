import type { SettingsDiagnosticDto } from "@stateful-mcp/macro-protocol";
import { useId, useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Diagnostic } from "../ui/primitives";

/**
 * Renders one structured diagnostic: localized message as primary copy,
 * technical code/path/params collapsed behind a details toggle. Raw keys are
 * never rendered as user-facing copy; unmapped codes degrade to the
 * technical view only.
 */
export function FieldDiagnostic({
	diagnostic,
	label,
}: {
	readonly diagnostic: SettingsDiagnosticDto;
	readonly label?: string;
}) {
	const i18n = useI18n();
	const { t } = i18n;
	const detailsId = useId();
	const [open, setOpen] = useState(false);
	const path = diagnostic.path?.length ? diagnostic.path.join(".") : undefined;
	return (
		<div className="vs-diagnostic">
			<Diagnostic severity={diagnostic.severity}>
				<span>
					{label ? `${label}: ` : ""}
					{resolveCopy(i18n, diagnostic)}
				</span>
				{(diagnostic.code || path) && (
					<button
						type="button"
						className="vs-diagnostic-toggle"
						aria-expanded={open}
						aria-controls={detailsId}
						onClick={() => setOpen((value) => !value)}
					>
						{t("valueStudio.diagnostics.technicalDetails")}
					</button>
				)}
			</Diagnostic>
			{open && (
				<dl id={detailsId} className="vs-diagnostic-details">
					{diagnostic.code && (
						<>
							<dt>{t("valueStudio.diagnostics.code")}</dt>
							<dd>
								<code>{diagnostic.code}</code>
							</dd>
						</>
					)}
					{path && (
						<>
							<dt>{t("valueStudio.diagnostics.path")}</dt>
							<dd>
								<code>{path}</code>
							</dd>
						</>
					)}
				</dl>
			)}
		</div>
	);
}

function resolveCopy(
	i18n: ReturnType<typeof useI18n>,
	diagnostic: SettingsDiagnosticDto,
): string {
	const key = (diagnostic.messageKey ??
		"valueStudio.diagnostics.unmapped") as never;
	return i18n.t(key, diagnostic.messageParams);
}

export function DiagnosticList({
	diagnostics,
	emptyKey = "valueStudio.diagnostics.none",
}: {
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly emptyKey?: string;
}) {
	const { t } = useI18n();
	if (diagnostics.length === 0) {
		return <p className="vs-empty-note">{t(emptyKey as never)}</p>;
	}
	return (
		<ul className="vs-diagnostic-list">
			{diagnostics.map((diagnostic, index) => (
				<li key={`${diagnostic.code ?? "diag"}-${index}`}>
					<FieldDiagnostic diagnostic={diagnostic} />
				</li>
			))}
		</ul>
	);
}
