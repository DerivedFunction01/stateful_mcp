import * as Switch from "@radix-ui/react-switch";
import {
	AlertCircle,
	Check,
	ChevronDown,
	Info,
	LoaderCircle,
	X,
} from "lucide-react";
import type {
	ButtonHTMLAttributes,
	HTMLAttributes,
	InputHTMLAttributes,
	ReactNode,
	RefAttributes,
} from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
	className,
	variant = "secondary",
	icon,
	children,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	readonly variant?: ButtonVariant;
	readonly icon?: ReactNode;
}) {
	return (
		<button className={cn("button", `button-${variant}`, className)} {...props}>
			{icon}
			{children}
		</button>
	);
}

export function IconButton({
	label,
	className,
	children,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
	return (
		<button
			className={cn("icon-button", className)}
			aria-label={label}
			{...props}
		>
			{children}
		</button>
	);
}

export function ModalOverlay({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
	return (
		<div className={cn("modal-overlay", className)} {...props}>
			{children}
		</div>
	);
}

export function ModalSurface({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
	return (
		<div className={cn("modal-card", className)} {...props}>
			{children}
		</div>
	);
}

export function Badge({
	children,
	tone = "neutral",
}: {
	readonly children: ReactNode;
	readonly tone?:
		| "neutral"
		| "info"
		| "success"
		| "warning"
		| "danger"
		| "accent";
}) {
	return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

export function Card({
	children,
	className,
	title,
	action,
}: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly title?: string;
	readonly action?: ReactNode;
}) {
	return (
		<section className={cn("card", className)}>
			{(title || action) && (
				<header className="card-header">
					{title && <h2>{title}</h2>}
					{action}
				</header>
			)}
			{children}
		</section>
	);
}

export function TextInput({
	label,
	hint,
	error,
	...props
}: InputHTMLAttributes<HTMLInputElement> & {
	readonly label: string;
	readonly hint?: string;
	readonly error?: string;
}) {
	return (
		<label className="field">
			<span className="field-label">{label}</span>
			<input
				className={cn("input", error && "input-error")}
				aria-invalid={Boolean(error)}
				{...props}
			/>
			{error ? (
				<span className="field-error">
					<AlertCircle size={14} />
					{error}
				</span>
			) : (
				hint && <span className="field-hint">{hint}</span>
			)}
		</label>
	);
}

export function SelectField({
	label,
	value,
	options,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly options: readonly { id: string; label: string }[];
	readonly onChange: (value: string) => void;
}) {
	return (
		<label className="field">
			<span className="field-label">{label}</span>
			<span className="select-wrap">
				<select
					className="input select"
					value={value}
					onChange={(event) => onChange(event.target.value)}
				>
					{options.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown size={16} aria-hidden="true" />
			</span>
		</label>
	);
}

export function Toggle({
	label,
	checked,
	onChange,
}: {
	readonly label: string;
	readonly checked: boolean;
	readonly onChange: (checked: boolean) => void;
}) {
	return (
		<label className="toggle-row" htmlFor={label + "-toggle"}>
			<span>{label}</span>
			<Switch.Root
				id={label + "-toggle"}
				checked={checked}
				onCheckedChange={onChange}
				className={cn("toggle", checked && "toggle-checked")}
				aria-label={label}
			>
				<Switch.Thumb />
			</Switch.Root>
		</label>
	);
}

export function Diagnostic({
	severity,
	children,
}: {
	readonly severity: "info" | "success" | "warning" | "error";
	readonly children: ReactNode;
}) {
	const Icon =
		severity === "error"
			? X
			: severity === "warning"
				? AlertCircle
				: severity === "success"
					? Check
					: Info;
	return (
		<div
			className={cn("diagnostic", `diagnostic-${severity}`)}
			role={severity === "error" ? "alert" : "status"}
		>
			<Icon size={16} />
			{children}
		</div>
	);
}

export function Loading({ label = "Loading" }: { readonly label?: string }) {
	return (
		<span className="loading">
			<LoaderCircle size={15} className="spin" />
			{label}
		</span>
	);
}
