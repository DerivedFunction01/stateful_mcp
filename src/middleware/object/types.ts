export interface ObjectState {
  objectId: string;
  schemaName: string;
  parentObjectId?: string | null;
  data: Record<string, any>;
  createdAt: string;
  schema_pinned_at?: string;
}

export interface ObjectDiffResult {
  added: Record<string, any>;
  updated: Record<string, { old: any; new: any }>;
  removed: string[];
}
