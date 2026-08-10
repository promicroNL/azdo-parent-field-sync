import type {
  FieldMapping,
  FieldMutation,
  FieldValue,
  SyncLogger,
  SyncOptions,
  SyncStats,
  WorkItem,
  WorkItemClient
} from "./types";

const PARENT_RELATION_TYPE = "System.LinkTypes.Hierarchy-Reverse";
const TAGS_FIELD_REFERENCE_NAME = "system.tags";

interface FieldState {
  exists: boolean;
  value?: unknown;
}

function getFieldState(workItem: WorkItem, referenceName: string): FieldState {
  if (!Object.prototype.hasOwnProperty.call(workItem.fields, referenceName)) {
    return { exists: false };
  }

  return { exists: true, value: workItem.fields[referenceName] };
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function asScalar(value: unknown, mapping: FieldMapping, parentId: number): FieldValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  throw new Error(
    `Parent ${parentId} field '${mapping.source}' contains a non-scalar value. Only strings, picklists, numbers, booleans, dates, GUIDs, and System.Tags are supported.`
  );
}

function valuesEqual(left: unknown, right: FieldValue): boolean {
  return Object.is(left, right);
}

function isTagsField(referenceName: string): boolean {
  return referenceName.toLocaleLowerCase("en-US") === TAGS_FIELD_REFERENCE_NAME;
}

function getParentId(child: WorkItem): number | undefined {
  const relation = child.relations?.find((candidate) => candidate.rel === PARENT_RELATION_TYPE);
  if (!relation) {
    return undefined;
  }

  const match = relation.url?.match(/\/workItems\/(\d+)$/u);
  if (!match?.[1]) {
    throw new Error(`Could not extract the parent ID from relation '${relation.url ?? "<missing>"}'.`);
  }

  return Number.parseInt(match[1], 10);
}

function createStats(): SyncStats {
  return {
    checkedWorkItems: 0,
    updatedWorkItems: 0,
    updatedFields: 0,
    clearedFields: 0,
    unchangedFields: 0,
    preservedFields: 0,
    noParent: 0,
    wrongParentType: 0,
    missingParent: 0,
    errors: 0
  };
}

function addClearMutation(
  child: WorkItem,
  targetField: string,
  mutations: FieldMutation[],
  stats: SyncStats
): void {
  const targetState = getFieldState(child, targetField);
  if (!targetState.exists || isEmptyValue(targetState.value)) {
    stats.unchangedFields += 1;
    return;
  }

  mutations.push({ field: targetField, operation: "remove" });
}

function planMappedField(
  child: WorkItem,
  parent: WorkItem,
  mapping: FieldMapping,
  options: SyncOptions,
  mutations: FieldMutation[],
  stats: SyncStats
): void {
  const sourceState = getFieldState(parent, mapping.source);
  if (!sourceState.exists || isEmptyValue(sourceState.value)) {
    if (options.preserveChildValueWhenParentEmpty) {
      stats.preservedFields += 1;
      return;
    }

    addClearMutation(child, mapping.target, mutations, stats);
    return;
  }

  const desiredValue = asScalar(sourceState.value, mapping, parent.id);
  const targetState = getFieldState(child, mapping.target);
  if (targetState.exists && valuesEqual(targetState.value, desiredValue)) {
    stats.unchangedFields += 1;
    return;
  }

  const operation =
    options.replaceChildTags && isTagsField(mapping.target) && targetState.exists
      ? "replace"
      : "add";
  mutations.push({ field: mapping.target, operation, value: desiredValue });
}

export async function synchronize(
  client: WorkItemClient,
  options: SyncOptions,
  logger: SyncLogger
): Promise<SyncStats> {
  const stats = createStats();

  for (const mapping of options.fieldMappings) {
    try {
      await client.assertFieldAvailable(options.parentWorkItemType, mapping.source);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Field '${mapping.source}' is not available on parent work item type '${options.parentWorkItemType}'. Add the field to that work item type in the inherited process, then run the sync again. ${detail}`
      );
    }
    logger.info(`Validated ${options.parentWorkItemType}.${mapping.source}`);
    try {
      await client.assertFieldAvailable(options.childWorkItemType, mapping.target);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Field '${mapping.target}' is not available on child work item type '${options.childWorkItemType}'. Add the field to that work item type in the inherited process, then run the sync again. ${detail}`
      );
    }
    logger.info(`Validated ${options.childWorkItemType}.${mapping.target}`);
  }

  const childIds = await client.queryWorkItemIds(options.childWorkItemType);
  if (childIds.length === 0) {
    logger.info(`No '${options.childWorkItemType}' work items found. Nothing to do.`);
    return stats;
  }

  logger.info(`Found ${childIds.length} '${options.childWorkItemType}' work items.`);
  const children = await client.getWorkItems(
    childIds,
    options.fieldMappings.map((mapping) => mapping.target),
    true
  );
  const parentIds = new Set<number>();
  const parentByChildId = new Map<number, number | undefined>();

  for (const child of children) {
    const parentId = getParentId(child);
    parentByChildId.set(child.id, parentId);
    if (parentId !== undefined) {
      parentIds.add(parentId);
    }
  }

  const parents = await client.getWorkItems(
    [...parentIds],
    ["System.WorkItemType", ...options.fieldMappings.map((mapping) => mapping.source)],
    false
  );
  const parentsById = new Map(parents.map((parent) => [parent.id, parent]));
  logger.info(`Found ${parentsById.size} unique parent work items.`);

  for (const child of children) {
    stats.checkedWorkItems += 1;

    try {
      const parentId = parentByChildId.get(child.id);
      const mutations: FieldMutation[] = [];

      if (parentId === undefined) {
        stats.noParent += 1;
        if (options.preserveChildValueWhenNoParent) {
          stats.preservedFields += options.fieldMappings.length;
          logger.debug(`${options.childWorkItemType} ${child.id} has no parent; values preserved.`);
          continue;
        }

        for (const mapping of options.fieldMappings) {
          addClearMutation(child, mapping.target, mutations, stats);
        }
      } else {
        const parent = parentsById.get(parentId);
        if (!parent) {
          stats.missingParent += 1;
          logger.warning(`${options.childWorkItemType} ${child.id}: parent ${parentId} could not be retrieved.`);
          continue;
        }

        const parentType = getFieldState(parent, "System.WorkItemType").value;
        if (parentType !== options.parentWorkItemType) {
          stats.wrongParentType += 1;
          logger.debug(
            `${options.childWorkItemType} ${child.id}: parent ${parentId} is '${String(parentType)}', expected '${options.parentWorkItemType}'.`
          );
          continue;
        }

        for (const mapping of options.fieldMappings) {
          planMappedField(child, parent, mapping, options, mutations, stats);
        }
      }

      if (mutations.length === 0) {
        continue;
      }

      const action = options.dryRun ? "Would update" : "Updating";
      logger.info(
        `${action} ${options.childWorkItemType} ${child.id}: ${mutations.map((mutation) => mutation.field).join(", ")}`
      );

      if (!options.dryRun) {
        await client.updateFields(child.id, child.rev, mutations);
      }

      stats.updatedWorkItems += 1;
      stats.updatedFields += mutations.length;
      stats.clearedFields += mutations.filter((mutation) => mutation.operation === "remove").length;
    } catch (error) {
      stats.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`${options.childWorkItemType} ${child.id}: ${message}`);
    }
  }

  return stats;
}

export function formatSummary(stats: SyncStats, dryRun: boolean): string[] {
  return [
    dryRun ? "Synchronization summary (dry run)" : "Synchronization summary",
    `Checked work items : ${stats.checkedWorkItems}`,
    `${dryRun ? "Would update" : "Updated"} work items : ${stats.updatedWorkItems}`,
    `${dryRun ? "Would update" : "Updated"} fields     : ${stats.updatedFields}`,
    `${dryRun ? "Would clear" : "Cleared"} fields     : ${stats.clearedFields}`,
    `Unchanged fields   : ${stats.unchangedFields}`,
    `Preserved fields   : ${stats.preservedFields}`,
    `No parent          : ${stats.noParent}`,
    `Wrong parent type  : ${stats.wrongParentType}`,
    `Missing parent     : ${stats.missingParent}`,
    `Errors             : ${stats.errors}`
  ];
}
