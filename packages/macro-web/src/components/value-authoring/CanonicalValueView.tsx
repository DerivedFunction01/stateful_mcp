import type { ValueSampleResultDto } from "@stateful-mcp/macro-protocol";
import { useI18n } from "../../lib/macro-i18n-provider";

function canonicalText(value: unknown): string {
	if (value === undefined) return "—";
	return JSON.stringify(value, null, 2) ?? String(value);
}

export function CanonicalValueView({
	result,
}: {
	readonly result: ValueSampleResultDto;
}) {
	const { t } = useI18n();
	const spans = result.captures ?? {};
	return (
		<div className="vs-canonical">
			<h4>{t("valueStudio.preview.canonical")}</h4>
			<pre className="vs-canonical-json">
				<code>{canonicalText(result.canonicalValue)}</code>
			</pre>
			{result.displayValue && (
				<p className="vs-display-value">
					{t("valueStudio.preview.display")}: {result.displayValue}
				</p>
			)}
			{Object.keys(spans).length > 0 && (
				<p className="vs-captures">
					{t("valueStudio.preview.captures")}:{" "}
					{Object.entries(spans)
						.map(([name, value]) => `${name}="${value}"`)
						.join(" · ")}
				</p>
			)}
			{result.recipeId && (
				<p className="vs-recipe-id">
					{t("valueStudio.preview.recipe")}: <code>{result.recipeId}</code>
				</p>
			)}
		</div>
	);
}
