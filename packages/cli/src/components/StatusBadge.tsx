import { Text } from "ink";
import { t } from "../lib/i18n";

function statusColor(status: string): string {
	if (status === "active") return "green";
	if (status === "suspended") return "yellow";
	if (status === "confirmed") return "blue";
	if (status === "rule_out") return "red";
	return "gray";
}

export function StatusBadge({ status }: { status: string }) {
	return (
		<Text color={statusColor(status) as any}>
			{status === "rule_out" ? t("workspace.ruledOut") : status}
		</Text>
	);
}
