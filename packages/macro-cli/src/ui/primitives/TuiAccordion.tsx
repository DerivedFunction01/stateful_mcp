import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── TUI ACCORDION ────────────────────────────────────────────────────────────

export interface TuiAccordionSection {
	readonly id: string;
	readonly title: string;
	readonly subtitle?: string;
	readonly isOpen: boolean;
	readonly badge?: string;
	readonly content?: ReactNode;
}

export interface TuiAccordionProps {
	readonly sections: readonly TuiAccordionSection[];
	readonly focusedIndex?: number;
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
}

export function TuiAccordion({
	sections,
	focusedIndex = 0,
	width,
	theme,
}: TuiAccordionProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	return (
		<box flexDirection="column" width={width}>
			{sections.map((sec, idx) => {
				const isFocused = idx === focusedIndex;
				const chevron = sec.isOpen ? "▼" : "▶";
				const headerBg = isFocused ? c.bgActive : c.bgSurface;

				return (
					<box key={sec.id} flexDirection="column" marginBottom={1}>
						{/* Accordion Header */}
						<box
							flexDirection="row"
							height={1}
							backgroundColor={headerBg}
							paddingLeft={1}
							paddingRight={1}
						>
							<text
								fg={isFocused ? c.accentPrimary : c.fgMuted}
								attributes={TextAttributes.BOLD}
							>
								{chevron}{" "}
							</text>
							<text
								fg={isFocused ? c.fgPrimary : c.fgSecondary}
								attributes={TextAttributes.BOLD}
							>
								{sec.title}
							</text>
							{sec.subtitle && (
								<text fg={c.fgDim} attributes={TextAttributes.DIM}>
									{"  "}
									{sec.subtitle}
								</text>
							)}
							<box flexGrow={1} />
							{sec.badge && (
								<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
									[{sec.badge}]
								</text>
							)}
						</box>

						{/* Accordion Body */}
						{sec.isOpen && (
							<box
								flexDirection="column"
								borderStyle="single"
								borderColor={isFocused ? c.borderActive : c.borderSubtle}
								backgroundColor={c.bgElevated}
								padding={1}
							>
								{sec.content}
							</box>
						)}
					</box>
				);
			})}
		</box>
	);
}

// ─── TUI BREADCRUMBS ──────────────────────────────────────────────────────────

export interface TuiBreadcrumbItem {
	readonly id: string;
	readonly label: string;
	readonly icon?: string;
}

export interface TuiBreadcrumbsProps {
	readonly items: readonly TuiBreadcrumbItem[];
	readonly activeId?: string;
	readonly separator?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiBreadcrumbs({
	items,
	activeId,
	separator = "›",
	theme,
}: TuiBreadcrumbsProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const lastIdx = items.length - 1;

	return (
		<box flexDirection="row" height={1}>
			{items.map((item, idx) => {
				const isLast = idx === lastIdx || item.id === activeId;

				return (
					<box key={item.id} flexDirection="row">
						{item.icon && <text fg={c.accentPrimary}>{item.icon} </text>}
						<text
							fg={isLast ? c.fgPrimary : c.fgMuted}
							attributes={isLast ? TextAttributes.BOLD : 0}
						>
							{item.label}
						</text>
						{!isLast && (
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{" "}
								{separator}{" "}
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}

// ─── TUI STEPPER (Multi-Step Wizard Progress) ─────────────────────────────────

export interface TuiStepItem {
	readonly id: string;
	readonly label: string;
	readonly status: "completed" | "active" | "upcoming" | "error";
}

export interface TuiStepperProps {
	readonly steps: readonly TuiStepItem[];
	readonly theme?: TuiThemeDefinition;
}

export function TuiStepper({ steps, theme }: TuiStepperProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const lastIdx = steps.length - 1;

	return (
		<box flexDirection="row" height={1}>
			{steps.map((step, idx) => {
				let glyph = "○";
				let fgColor = c.fgDim;
				let isBold = false;

				if (step.status === "completed") {
					glyph = "✓";
					fgColor = c.statusSuccess;
					isBold = true;
				} else if (step.status === "active") {
					glyph = "●";
					fgColor = c.accentPrimary;
					isBold = true;
				} else if (step.status === "error") {
					glyph = "✗";
					fgColor = c.statusError;
					isBold = true;
				}

				return (
					<box key={step.id} flexDirection="row">
						<text fg={fgColor} attributes={isBold ? TextAttributes.BOLD : 0}>
							{glyph} {step.label}
						</text>
						{idx < lastIdx && (
							<text
								fg={
									step.status === "completed"
										? c.statusSuccess
										: c.borderDefault
								}
							>
								{" ─── "}
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}
