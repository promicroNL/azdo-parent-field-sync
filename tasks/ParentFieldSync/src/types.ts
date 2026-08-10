export type FieldValue = string | number | boolean | null;

export interface FieldMapping {
  source: string;
  target: string;
}

export interface WorkItemRelation {
  rel?: string;
  url?: string;
}

export interface WorkItem {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  relations?: WorkItemRelation[];
}

export type FieldMutation =
  | {
      field: string;
      operation: "remove";
    }
  | {
      field: string;
      operation: "add" | "replace";
      value: FieldValue;
    };

export interface WorkItemClient {
  assertFieldAvailable(workItemType: string, fieldReferenceName: string): Promise<void>;
  queryWorkItemIds(workItemType: string): Promise<number[]>;
  getWorkItems(
    ids: number[],
    fields: string[],
    includeRelations: boolean
  ): Promise<WorkItem[]>;
  updateFields(id: number, revision: number, mutations: FieldMutation[]): Promise<void>;
}

export interface SyncLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface SyncOptions {
  parentWorkItemType: string;
  childWorkItemType: string;
  fieldMappings: FieldMapping[];
  preserveChildValueWhenParentEmpty: boolean;
  preserveChildValueWhenNoParent: boolean;
  replaceChildTags: boolean;
  dryRun: boolean;
}

export interface SyncStats {
  checkedWorkItems: number;
  updatedWorkItems: number;
  updatedFields: number;
  clearedFields: number;
  unchangedFields: number;
  preservedFields: number;
  noParent: number;
  wrongParentType: number;
  missingParent: number;
  errors: number;
}
