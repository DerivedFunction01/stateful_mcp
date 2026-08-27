import type { EntryProvenance } from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";

const PROVENANCE_KEY: Record<EntryProvenance, string> = {
	inherited: "valueStudio.provenance.inherited",
	replaced: "valueStudio.provenance.replaced",
	appended: "valueStudio.provenance.appended",
	disabled: "valueStudio.provenance.disabled",
	local: "valueStudio.provenance.local",
};

const PROVENANCE_TONE: Record<
	EntryProvenance,
	"neutral" | "accent" | "warning" | "success"
> = {
	inherited: "neutral",
	replaced: "accent",
	appended: "success",
	disabled: "warning",
	local: "neutral",
};

export function ProvenanceBadge({
	provenance,
}: {
	readonly provenance: EntryProvenance;
}) {
	const { t } = useI18n();
	return (
		<Badge tone={PROVENANCE_TONE[provenance]}>
			{t(PROVENANCE_KEY[provenance] as never)}
		</Badge>
	);
}
