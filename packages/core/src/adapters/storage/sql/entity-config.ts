export interface ChildTableConfig<Child> {
	table: string;
	parentIdColumn: string;
	orderColumn?: string;
	stateField: string;
	toRow: (child: Child, index: number, parentId: string) => Record<string, any>;
	fromRow: (row: Record<string, any>) => Child;
	toState?: (items: Child[]) => any;
}

export interface EntityConfig<Session, Persistent> {
	idPrefix: string;
	idField: string;
	parentIdColumn?: string;
	sessionTable: string;
	savedTable: string;
	aliasTable: string;
	sessionToRow: (
		id: string,
		sessionId: string,
		state: Session,
	) => Record<string, any>;
	rowToSession: (row: Record<string, any>) => Session;
	persistentToRow: (
		id: string,
		scope: { level: string; userId?: string | null },
		state: Persistent,
	) => Record<string, any>;
	rowToPersistent: (
		row: Record<string, any>,
		savedRow: Record<string, any> | null,
	) => Persistent;
	savedToRow: (
		id: string,
		scope: { level: string; userId?: string | null },
		state: Persistent,
	) => Record<string, any>;
	children?: ChildTableConfig<any>[];
}
