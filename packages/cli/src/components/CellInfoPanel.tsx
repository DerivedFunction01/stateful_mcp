import type { PresentationField } from "@stateful-mcp/clinical/presentation/field-types";
import type { CellInterpretationSummary } from "@stateful-mcp/clinical/session/cell-interpretation-summary";
import { Box, Text, useInput, useStdout } from "ink";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { resolveInspectorKey } from "../lib/editor";
import { t } from "../lib/shared/i18n";

interface CellInfoPanelProps {
	summary: CellInterpretationSummary;
	onClose: () => void;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "—";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function valueText(field: PresentationField): string {
	if (field.formatted?.text) return field.formatted.text;
	if (
		field.kind === "concept" &&
		field.value &&
		typeof field.value === "object"
	) {
		return String(
			(field.value as { display?: unknown }).display ??
				formatValue(field.value),
		);
	}
	if (field.kind === "boolean") return field.value ? "yes" : "no";
	return formatValue(field.value);
}

function fieldColor(field: PresentationField): string | undefined {
	if (field.state === "unresolved") return "yellow";
	if (field.emphasis === "diagnostic") return "yellow";
	if (field.emphasis === "primary") return "cyan";
	if (field.kind === "concept") return "cyan";
	return undefined;
}

function buildRows(
	itemIdx: number,
	field: PresentationField,
	depth: number,
	rows: ReactElement[],
): void {
	const indent = "    ".repeat(depth);
	const hasChildren = (field.children?.length ?? 0) > 0;
	if (hasChildren) {
		rows.push(
			<Text
				key={`${itemIdx}-${field.path}`}
				color={fieldColor(field)}
				bold={field.emphasis === "primary"}
			>
				{indent}
				{field.label}
			</Text>,
		);
		field.children!.forEach((child) =>
			buildRows(itemIdx, child, depth + 1, rows),
		);
	} else {
		rows.push(
			<Text
				key={`${itemIdx}-${field.path}`}
				color={fieldColor(field)}
				dimColor={field.kind === "object"}
			>
				{indent}
				{field.label}: <Text color="white">{valueText(field)}</Text>
				{field.state === "unresolved" ? (
					<Text color="yellow">{t("inspector.unresolved")}</Text>
				) : null}
			</Text>,
		);
	}
}

export function CellInfoPanel({ summary, onClose }: CellInfoPanelProps) {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const terminalRows = stdout?.rows ?? 24;

	const [offset, setOffset] = useState(0);

	const rawRows: ReactElement[] = [];

	// Header
	rawRows.push(
		<Text key="title" bold inverse>
			{" "}
			{t("inspector.title")} <Text color="gray"> · {summary.cellId}</Text>
		</Text>,
	);

	// Status strip
	const confidence =
		summary.diagnostics.confidence.state === "available"
			? `${summary.diagnostics.confidence.level.toUpperCase()} (${summary.diagnostics.confidence.score.toFixed(2)})`
			: t("inspector.unavailable");
	const confidenceColor =
		summary.diagnostics.confidence.state === "unavailable"
			? "gray"
			: summary.diagnostics.confidence.level === "high"
				? "green"
				: summary.diagnostics.confidence.level === "medium"
					? "yellow"
					: "red";
	rawRows.push(
		<Text key="status">
			<Text
				color={
					summary.status === "error"
						? "red"
						: summary.status === "committed"
							? "green"
							: "cyan"
				}
			>
				● {t(`status.${summary.status}`)}
			</Text>
			<Text color="gray"> {t("inspector.mode", { value: summary.mode })}</Text>
			<Text> {t("inspector.scope", { value: summary.routing.scope })}</Text>
			<Text color={confidenceColor}>
				{" "}
				{t("inspector.confidence", { value: confidence })}
			</Text>
		</Text>,
	);

	// Source / Routing / Diagnostics (adaptive columns when wide)
	const sourceRows: ReactElement[] = [
		<Text key="src-label" bold>
			{t("inspector.source")}
		</Text>,
		<Text key="src">{summary.rawInput || "—"}</Text>,
		<Text key="routing-label" bold>
			{t("inspector.routing")}
		</Text>,
		<Text key="routing">
			{summary.routing.section ?? "—"} →{" "}
			{summary.routing.targetSchema ?? summary.routing.resolvedSchema ?? "—"}
		</Text>,
		...(summary.routing.branchId
			? [
					<Text key="branch" dimColor>
						{t("inspector.branch", { value: summary.routing.branchId })}
					</Text>,
				]
			: []),
		<Text key="diag-label" bold>
			{t("inspector.diagnostics")}
		</Text>,
		...(summary.diagnostics.error
			? [
					<Text key="err" color="red">
						! {summary.diagnostics.error.message}
					</Text>,
				]
			: []),
		<Text key="alt" dimColor>
			{t("inspector.alternatives", { value: summary.diagnostics.alternatives })}
		</Text>,
		<Text key="val" dimColor>
			{t("inspector.validation", { value: summary.diagnostics.validation })}
		</Text>,
	];
	if (columns >= 100) {
		const left: ReactElement[] = [];
		const right: ReactElement[] = [];
		sourceRows.forEach((row, i) => (i < 4 ? left.push(row) : right.push(row)));
		rawRows.push(
			<Box key="context" flexDirection="row">
				<Box flexDirection="column" width={Math.floor(columns * 0.45)}>
					{left}
				</Box>
				<Box flexDirection="column">{right}</Box>
			</Box>,
		);
	} else {
		let idx = 0;
		for (const row of sourceRows) {
			if (idx === 4 || idx === 7)
				rawRows.push(<Text key={`ctx-${idx}`}> </Text>);
			rawRows.push(row);
			idx += 1;
		}
	}

	// Interpretation rows
	if (summary.items.length === 0) {
		rawRows.push(
			<Text key="no-items" dimColor>
				{" "}
				{t("inspector.noItems")}
			</Text>,
		);
	} else {
		summary.items.forEach((item, itemIndex) => {
			rawRows.push(
				<Text key={`item-${itemIndex}`} color="cyan" bold>
					[{itemIndex + 1}] {item.title ?? item.targetSchema}
					<Text dimColor> · {item.targetSchema}</Text>
				</Text>,
			);
			if (item.presentation) {
				item.presentation.groups.forEach((group) => {
					rawRows.push(
						<Text key={`g-${itemIndex}-${group.id}`} bold dimColor underline>
							{"    "}
							{group.label}
						</Text>,
					);
					if (group.fields.length === 0) {
						rawRows.push(
							<Text key={`e-${itemIndex}-${group.id}`} dimColor>
								{"        "}
								{t("inspector.noValues")}
							</Text>,
						);
					}
					group.fields.forEach((field) =>
						buildRows(itemIndex, field, 3, rawRows),
					);
				});
			} else if (item.fields.length === 0) {
				rawRows.push(
					<Text key={`e-${itemIndex}`} dimColor>
						{"    "}
						{t("inspector.noFields")}
					</Text>,
				);
			} else {
				item.fields.forEach((field) => {
					rawRows.push(
						<Text key={`l-${itemIndex}-${field.path}`}>
							{"    "}
							{field.path}: {formatValue(field.value)}
							{field.state === "unresolved" ? t("inspector.unresolved") : ""}
						</Text>,
					);
				});
			}
		});
	}

	// Footer (dynamically composed)
	const footerText = `${t("inspector.scrollHint")} · ${t("inspector.closeFooter")}`;
	rawRows.push(
		<Text key="footer" color="gray">
			┌ {footerText} ┐
		</Text>,
	);

	const headerHeight = 3;
	const footerHeight = 1;
	const viewHeight = Math.max(terminalRows - headerHeight - footerHeight, 5);
	const maxOffset = Math.max(rawRows.length - viewHeight, 0);
	const current = Math.min(offset, maxOffset);
	const visible = rawRows.slice(current, current + viewHeight);

	useEffect(() => setOffset((o) => Math.min(o, maxOffset)), [maxOffset]);

	useInput((input, key) => {
		const action = resolveInspectorKey(input, key);
		switch (action) {
			case "close":
				onClose();
				return;
			case "scrollDown":
				setOffset((o) => Math.min(o + 1, maxOffset));
				return;
			case "scrollUp":
				setOffset((o) => Math.max(o - 1, 0));
				return;
			case "pageDown":
				setOffset((o) => Math.min(o + viewHeight, maxOffset));
				return;
			case "pageUp":
				setOffset((o) => Math.max(o - viewHeight, 0));
				return;
			case "scrollTop":
				setOffset(0);
				return;
			case "scrollBottom":
				setOffset(maxOffset);
				return;
			default:
				return;
		}
	});

	const position =
		maxOffset === 0
			? "1/1"
			: `${current + 1}-${Math.min(current + viewHeight, rawRows.length)}/${rawRows.length}`;

	const bottomHint = t("inspector.closeFooter");
	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box width="100%">
				<Text>{"─".repeat(Math.max(columns, 20))}</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={1}>
				{visible}
			</Box>
			<Box width="100%">
				<Text color="gray">{"─".repeat(Math.max(columns, 20))}</Text>
			</Box>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				paddingLeft={1}
				paddingRight={1}
			>
				<Text color="gray">{position}</Text>
				<Text color="gray">{bottomHint}</Text>
			</Box>
		</Box>
	);
}
