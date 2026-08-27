import type {
	NumericOptionKey,
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { canonicalNumericForms } from "@stateful-mcp/macro/workspace/config/wizard";
import { useMemo, useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Button, TextInput, Toggle } from "../ui/primitives";

const NUMERIC_FORM_KEY: Record<string, string> = {
	decimal: "valueStudio.numerics.form.decimal",
	integer: "valueStudio.numerics.form.integer",
	fraction: "valueStudio.numerics.form.fraction",
	"mixed-fraction": "valueStudio.numerics.form.mixedFraction",
	scientific: "valueStudio.numerics.form.scientific",
	ordinal: "valueStudio.numerics.form.ordinal",
	"number-words": "valueStudio.numerics.form.numberWords",
};

type TextOption = Extract<
	NumericOptionKey,
	"decimalSeparator" | "thousandsSeparator"
>;

const TEXT_OPTIONS: readonly {
	key: TextOption;
	labelKey: string;
	hintKey: string;
}[] = [
	{
		key: "decimalSeparator",
		labelKey: "valueStudio.numerics.decimalLabel",
		hintKey: "valueStudio.numerics.separatorHint",
	},
	{
		key: "thousandsSeparator",
		labelKey: "valueStudio.numerics.groupingLabel",
		hintKey: "valueStudio.numerics.separatorHint",
	},
];

export function NumericsLexiconStep({
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const i18n = useI18n();
	const { t } = i18n;
	const numerics = store.view.numerics();
	const forms = useMemo(() => canonicalNumericForms(), []);
	const [newAtomWord, setNewAtomWord] = useState("");
	const [newAtomDigits, setNewAtomDigits] = useState("");

	const atomEntries = Object.entries(numerics.atoms);
	const coverage =
		atomEntries.length === 0
			? null
			: {
					from: Math.min(
						...atomEntries
							.map(([, digits]) => Number.parseInt(digits, 10))
							.filter((value) => Number.isFinite(value)),
					),
					to: Math.max(
						...atomEntries
							.map(([, digits]) => Number.parseInt(digits, 10))
							.filter((value) => Number.isFinite(value)),
					),
				};

	return (
		<div className="vs-step">
			<h3>{t("valueStudio.step.numericsLexicon.title")}</h3>

			<section className="vs-separators">
				{TEXT_OPTIONS.map((option) => (
					<TextInput
						key={option.key}
						label={t(option.labelKey as never)}
						hint={t(option.hintKey as never)}
						value={
							option.key === "decimalSeparator"
								? (numerics.decimalSeparator ?? "")
								: (numerics.thousandsSeparator ?? "")
						}
						onChange={(event) =>
							store.actions.setNumericOption(option.key, event.target.value)
						}
					/>
				))}
				<Toggle
					label={t("valueStudio.numerics.allowNegative")}
					checked={numerics.allowNegative === true}
					onChange={(checked) =>
						store.actions.setNumericOption("allowNegative", checked)
					}
				/>
			</section>

			<section className="vs-forms">
				<h4>{t("valueStudio.numerics.formsTitle")}</h4>
				<div className="vs-form-toggles">
					{forms.map((form) => (
						<Toggle
							key={form}
							label={t((NUMERIC_FORM_KEY[form] ?? form) as never)}
							checked={numerics.allowedForms.includes(form)}
							onChange={(checked) =>
								store.actions.toggleNumericForm(form, checked)
							}
						/>
					))}
				</div>
			</section>

			<section className="vs-number-words">
				<h4>{t("valueStudio.numerics.wordsTitle")}</h4>
				{coverage ? (
					<p className="vs-coverage">
						{t("valueStudio.numerics.coverage", {
							from: coverage.from,
							to: coverage.to,
						})}
					</p>
				) : (
					<p className="vs-empty-note">{t("valueStudio.numerics.noWords")}</p>
				)}
				<ul className="vs-word-rows">
					{atomEntries.map(([word, digits]) => (
						<li key={word}>
							<code>{word}</code>
							<span>=</span>
							<TextInput
								label=""
								value={digits}
								onChange={(event) =>
									store.actions.setNumberWordAtom(word, event.target.value)
								}
							/>
							<Button
								variant="danger"
								onClick={() => store.actions.setNumberWordAtom(word, null)}
							>
								{t("valueStudio.action.removeEntry")}
							</Button>
						</li>
					))}
				</ul>
				<div className="vs-word-add">
					<TextInput
						label={t("valueStudio.numerics.word")}
						value={newAtomWord}
						onChange={(event) => setNewAtomWord(event.target.value)}
					/>
					<TextInput
						label={t("valueStudio.numerics.digits")}
						value={newAtomDigits}
						onChange={(event) => setNewAtomDigits(event.target.value)}
					/>
					<Button
						disabled={!newAtomWord.trim() || !newAtomDigits.trim()}
						onClick={() => {
							store.actions.setNumberWordAtom(
								newAtomWord.trim(),
								newAtomDigits.trim(),
							);
							setNewAtomWord("");
							setNewAtomDigits("");
						}}
					>
						{t("valueStudio.action.addEntry")}
					</Button>
				</div>
			</section>
		</div>
	);
}
