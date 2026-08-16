import { useState, type Dispatch, type KeyboardEvent } from "react";
import { filteredCommands } from "../reducer";
import type { PanelId, PrototypeAction, PrototypeCommand, PrototypeJournalEntry, PrototypeWorkspaceState } from "../model";

type Send = Dispatch<PrototypeAction>;

export function ActivityRail({ active, onSelect }: { active: PanelId; onSelect: (id: PanelId) => void }) {
	return <nav className="activity-rail" aria-label="Workspace views">
		{(["explorer", "slots", "journal", "domain"] as PanelId[]).map((id, index) => <button className={active === id ? "rail-item active" : "rail-item"} key={id} onClick={() => onSelect(id)} title={`Alt+${index + 1} ${id}`}><span>{["⌂", "▧", "◷", "◇"][index]}</span><small>{index + 1}</small></button>)}
	</nav>;
}

export function SidepanelActivityRail({ active, onSelect }: { active: PanelId; onSelect: (id: PanelId) => void }) {
	return <div className="side-activity-rail">{(["explorer", "slots", "journal", "domain"] as PanelId[]).map((id) => <button className={active === id ? "side-rail-item active" : "side-rail-item"} key={id} onClick={() => onSelect(id)}>{id.slice(0, 1).toUpperCase()}</button>)}</div>;
}

export function WorkspaceTabs({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
	return <div className="workspace-tabs" role="tablist">{["scratchpad", "notebook", "pos", "settings"].map((id) => <button className={active === id ? "workspace-tab active" : "workspace-tab"} key={id} onClick={() => onSelect(id)} role="tab" aria-selected={active === id}>{id === "pos" ? "POS app" : id}</button>)}</div>;
}

export function MainStage({ state, dispatch }: { state: PrototypeWorkspaceState; dispatch: Send }) {
	if (state.activeTabId === "scratchpad") return <ScratchpadSurface state={state} />;
	if (state.activeTabId === "pos") return <PosApplication />;
	return <EmptyState title={state.activeTabId} message="This tab is a visual prototype surface." />;
}

export function PosApplication() {
	const products = [
		{ id: "coffee", name: "Coffee", detail: "Hot · 12oz", price: 3.5, icon: "☕" },
		{ id: "sandwich", name: "Sandwich", detail: "Turkey · toasted", price: 7.25, icon: "▣" },
		{ id: "tea", name: "Tea", detail: "Earl Grey", price: 2.75, icon: "♨" },
		{ id: "pastry", name: "Pastry", detail: "Almond croissant", price: 4.5, icon: "◇" },
	];
	const [cart, setCart] = useState<Record<string, number>>({ coffee: 2 });
	const [notice, setNotice] = useState("Ready for order entry");
	const add = (id: string) => { setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })); setNotice("Item added to draft order"); };
	const remove = (id: string) => setCart((current) => { const next = { ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }; if (!next[id]) delete next[id]; return next; });
	const lines = products.filter((product) => cart[product.id]);
	const total = lines.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0);
	return <section className="pos-app"><div className="pos-header"><div><span className="eyebrow">Retail extension · application tab</span><h1>Point of Sale</h1><p>Draft order <strong>#10482</strong> · Register 02 · Open</p></div><span className="pos-live"><i /> LIVE</span></div><div className="pos-layout"><div className="product-catalog"><div className="pos-section-heading"><span>Quick products</span><button onClick={() => setNotice("Product search is a prototype state")}>Search products</button></div><div className="product-grid">{products.map((product) => <button className="product-card" key={product.id} onClick={() => add(product.id)}><span className="product-icon">{product.icon}</span><strong>{product.name}</strong><small>{product.detail}</small><b>${product.price.toFixed(2)}</b></button>)}</div><div className="pos-actions"><button onClick={() => setNotice("Discount dialog is a prototype state")}>Discount</button><button onClick={() => setNotice("Customer lookup is a prototype state")}>Customer</button><button onClick={() => setNotice("Refund flow is a prototype state")}>Refund</button></div></div><aside className="cart-panel"><div className="cart-heading"><span>Current order</span><button onClick={() => { setCart({}); setNotice("Draft order cleared"); }}>Clear</button></div>{lines.length === 0 ? <div className="cart-empty">No items yet<br /><small>Select a product to begin</small></div> : <div className="cart-lines">{lines.map((product) => <div className="cart-line" key={product.id}><div><strong>{product.name}</strong><small>${product.price.toFixed(2)} each</small></div><div className="quantity"><button onClick={() => remove(product.id)}>−</button><span>{cart[product.id]}</span><button onClick={() => add(product.id)}>+</button></div></div>)}</div>}<div className="cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div><button className="pay-button" onClick={() => setNotice("Payment modal preview — no transaction was submitted")}>Pay ${total.toFixed(2)}</button><button className="hold-button" onClick={() => setNotice("Order #10482 held as a prototype state")}>Hold order</button><div className="pos-notice">{notice}</div></aside></div><div className="pos-footer"><span><kbd>Tab</kbd> move focus</span><span><kbd>Enter</kbd> add/select</span><span><kbd>Esc</kbd> cancel</span><span><kbd>Ctrl+Enter</kbd> submit order</span></div></section>;
}

export function ScratchpadSurface({ state }: { state: PrototypeWorkspaceState }) {
	return <section className="scratchpad-surface"><div className="surface-heading"><div><span className="eyebrow">{state.fixture === "core" ? "Workspace scratchpad" : `${state.fixture} workspace`}</span><h1>{state.fixture === "engineering" ? "Deployment Scratchpad" : "Macro Scratchpad"}</h1></div><span className="surface-badge">LIVE PROJECTION</span></div><p className="surface-description">Author one macro at a time. Preview, validate, and execute from the same surface.</p><div className="editor-card">{state.scratchpadLines.map((line, index) => <div className={line.status === "invalid" ? "editor-line invalid" : index === 1 ? "editor-line current" : "editor-line"} key={`${index}-${line.text}`}><span className="line-number">{String(index + 1).padStart(2, "0")}</span><span className="line-text">{line.text || " "}</span>{line.status === "valid" && <span className="line-state">✓</span>}{line.status === "invalid" && <span className="line-state error">!</span>}{line.status === "pinned" && <span className="line-state pinned">●</span>}{line.preview && <div className="projection">↳ {line.preview}</div>}{line.diagnostic && <div className="diagnostic">{line.diagnostic}</div>}</div>)}</div><div className="surface-footer"><span>↑↓ navigate</span><span>Ctrl+Enter execute</span><span>Alt+P pin macro</span></div></section>;
}

export function Sidepanel({ state, dispatch }: { state: PrototypeWorkspaceState; dispatch: Send }) {
	return <aside className="sidepanel"><div className="sidepanel-heading"><span className="eyebrow">{state.activeViewId}</span><button className="icon-button" onClick={() => dispatch({ type: "toggle-panel" })}>×</button></div>{state.activeViewId === "journal" ? <JournalPanel entries={state.journalEntries} /> : state.fixture === "retail" && state.activeViewId === "domain" ? <FormPanel state={state} dispatch={dispatch} /> : state.fixture === "engineering" && state.activeViewId === "domain" ? <DiagramPanel state={state} dispatch={dispatch} /> : state.activeViewId === "explorer" ? <EmptyState title="Branch inspector" message="Select a branch to inspect details." /> : <EmptyState title="Macro slots" message="Projected slots will appear here." />}</aside>;
}

export function CommandPaletteModal({ state, commands, dispatch }: { state: PrototypeWorkspaceState; commands: readonly PrototypeCommand[]; dispatch: Send }) {
	const grouped = commands.reduce<Record<string, PrototypeCommand[]>>((groups, command) => { (groups[command.category] ??= []).push(command); return groups; }, {});
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Escape") dispatch({ type: "palette-close" }); if (event.key === "ArrowDown") dispatch({ type: "palette-move", delta: 1 }); if (event.key === "ArrowUp") dispatch({ type: "palette-move", delta: -1 }); };
	return <div className="modal-backdrop" role="presentation" onClick={() => dispatch({ type: "palette-close" })}><section className="command-modal" role="dialog" aria-modal="true" aria-label="Commands" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown} tabIndex={-1}><div className="modal-title"><strong>Commands</strong><span>Esc</span></div><input autoFocus value={state.paletteQuery} onChange={(event) => dispatch({ type: "palette-query", query: event.target.value })} placeholder="Search commands" />{commands.length === 0 && <div className="empty-results">No commands match “{state.paletteQuery}”</div>}{Object.entries(grouped).map(([category, items]) => <div className="command-group" key={category}><h3>{category}</h3>{items.map((command) => { const index = commands.indexOf(command); return <button className={state.paletteSelection === index ? "command-row selected" : "command-row"} key={command.id} onClick={() => dispatch({ type: "palette-close" })}><span>{command.title}</span><kbd>{command.shortcut ?? ""}</kbd></button>; })}</div>)}</section></div>;
}

export function JournalPanel({ entries }: { entries: readonly PrototypeJournalEntry[] }) {
	return <div className="journal-panel"><div className="panel-title">Execution journal</div>{entries.map((entry) => <article className="journal-entry" key={entry.id}><div><strong>{entry.macro}</strong><span>{entry.time}</span></div><div><span className={`status-pill ${entry.status}`}>{entry.status}</span><code>{entry.fingerprint}</code></div>{entry.reason && <p>{entry.reason}</p>}</article>)}</div>;
}

export function FormPanel({ state, dispatch }: { state: PrototypeWorkspaceState; dispatch: Send }) {
	return <div className="form-panel"><div className="panel-title">Product details</div><label>SKU<input value="ABC-123" readOnly /></label><label>Category<div className="dropdown-wrap"><button className="dropdown-trigger" onClick={() => dispatch({ type: "dropdown-toggle" })}>{state.selectedDropdownValue}<span>⌄</span></button>{state.dropdownOpen && <Dropdown state={state} dispatch={dispatch} />}</div></label><button className="primary-button" onClick={() => dispatch({ type: "focus", id: "retail.add" })}>Add to cart</button></div>;
}

export function Dropdown({ state, dispatch }: { state: PrototypeWorkspaceState; dispatch: Send }) {
	return <div className="dropdown-menu">{["Electronics", "Grocery", "Clothing"].map((value) => <button className={value === state.selectedDropdownValue ? "dropdown-option selected" : "dropdown-option"} key={value} onClick={() => dispatch({ type: "dropdown-select", value })}>{value}</button>)}</div>;
}

export function DiagramPanel({ state, dispatch }: { state: PrototypeWorkspaceState; dispatch: Send }) {
	return <div className="diagram-panel"><div className="panel-title">Service graph <span>+/− zoom</span></div><div className="graph"><button className={state.diagramNode === "api" ? "node selected" : "node"} onClick={() => dispatch({ type: "diagram-node", node: "api" })}>api</button><div className="edge one" /><button className={state.diagramNode === "db" ? "node selected" : "node"} onClick={() => dispatch({ type: "diagram-node", node: "db" })}>database</button><div className="edge two" /><button className={state.diagramNode === "worker" ? "node selected" : "node"} onClick={() => dispatch({ type: "diagram-node", node: "worker" })}>worker</button></div><p className="focus-hint">Focused: <strong>{state.diagramNode}</strong> · arrows navigate · Enter inspect</p></div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) { return <div className="empty-state"><div className="empty-glyph">◌</div><h2>{title}</h2><p>{message}</p></div>; }

export function StatusBar({ state }: { state: PrototypeWorkspaceState }) { return <div className="status-bar"><span className="mode">NORMAL</span><span>Ln 2, Col 14</span><span>{state.scratchpadLines.filter((line) => line.status === "valid").length}/{state.scratchpadLines.length} valid</span><span className="status-spacer" /><span>fixture: {state.fixture}</span><span>locale: en</span></div>; }

export function HelpBar() { return <div className="help-bar"><span><kbd>Ctrl+P</kbd> commands</span><span><kbd>Ctrl+B</kbd> panel</span><span><kbd>Alt+1..9</kbd> views</span><span><kbd>Esc</kbd> close</span></div>; }
