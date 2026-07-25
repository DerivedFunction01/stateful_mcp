export interface SimpleEntityConfig<Session, Persistent> {
	idPrefix: string;
	idField: string;
	parentIdField?: string;
	tagsField: keyof Persistent;
	timestampField: keyof Session;
	parseTimestamp: (v: any) => number;
}
