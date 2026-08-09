import assert from "node:assert/strict";
import test from "node:test";
import { synchronize } from "../src/synchronize";
import type {
  FieldMutation,
  SyncLogger,
  SyncOptions,
  WorkItem,
  WorkItemClient
} from "../src/types";

interface UpdateCall {
  id: number;
  revision: number;
  mutations: FieldMutation[];
}

class FakeClient implements WorkItemClient {
  public readonly validated: string[] = [];
  public readonly updates: UpdateCall[] = [];
  public failUpdates = false;

  public constructor(
    private readonly children: WorkItem[],
    private readonly parents: WorkItem[]
  ) {}

  public async assertFieldAvailable(type: string, field: string): Promise<void> {
    this.validated.push(`${type}.${field}`);
  }

  public async queryWorkItemIds(): Promise<number[]> {
    return this.children.map((child) => child.id);
  }

  public async getWorkItems(
    _ids: number[],
    _fields: string[],
    includeRelations: boolean
  ): Promise<WorkItem[]> {
    return includeRelations ? this.children : this.parents;
  }

  public async updateFields(
    id: number,
    revision: number,
    mutations: FieldMutation[]
  ): Promise<void> {
    if (this.failUpdates) {
      throw new Error("Simulated revision conflict");
    }

    this.updates.push({ id, revision, mutations });
  }
}

const logger: SyncLogger = {
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined,
  debug: () => undefined
};

const defaultOptions: SyncOptions = {
  parentWorkItemType: "User Story",
  childWorkItemType: "Task",
  fieldMappings: [
    { source: "Custom.Process", target: "Custom.Process" },
    { source: "Custom.Customer", target: "Custom.ChildCustomer" }
  ],
  preserveChildValueWhenParentEmpty: false,
  preserveChildValueWhenNoParent: false,
  dryRun: false
};

function child(fields: Record<string, unknown>, withParent = true): WorkItem {
  return {
    id: 10,
    rev: 7,
    fields,
    relations: withParent
      ? [
          {
            rel: "System.LinkTypes.Hierarchy-Reverse",
            url: "https://dev.azure.com/example/_apis/wit/workItems/20"
          }
        ]
      : []
  };
}

function parent(fields: Record<string, unknown>): WorkItem {
  return {
    id: 20,
    rev: 3,
    fields: {
      "System.WorkItemType": "User Story",
      ...fields
    }
  };
}

test("updates all changed mappings in one work item request", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Old", "Custom.ChildCustomer": "Same" })],
    [parent({ "Custom.Process": "New", "Custom.Customer": "Same" })]
  );

  const stats = await synchronize(client, defaultOptions, logger);

  assert.deepEqual(client.updates, [
    {
      id: 10,
      revision: 7,
      mutations: [{ field: "Custom.Process", remove: false, value: "New" }]
    }
  ]);
  assert.equal(stats.updatedWorkItems, 1);
  assert.equal(stats.updatedFields, 1);
  assert.equal(stats.unchangedFields, 1);
  assert.deepEqual(client.validated, [
    "User Story.Custom.Process",
    "Task.Custom.Process",
    "User Story.Custom.Customer",
    "Task.Custom.ChildCustomer"
  ]);
});

test("clears populated mapped fields when a child has no parent", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Old", "Custom.ChildCustomer": "Customer" }, false)],
    []
  );

  const stats = await synchronize(client, defaultOptions, logger);

  assert.deepEqual(client.updates[0]?.mutations, [
    { field: "Custom.Process", remove: true },
    { field: "Custom.ChildCustomer", remove: true }
  ]);
  assert.equal(stats.noParent, 1);
  assert.equal(stats.clearedFields, 2);
});

test("preserves child fields when the parent source is empty", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Keep", "Custom.ChildCustomer": "Keep" })],
    [parent({ "Custom.Process": null, "Custom.Customer": "" })]
  );

  const stats = await synchronize(
    client,
    { ...defaultOptions, preserveChildValueWhenParentEmpty: true },
    logger
  );

  assert.equal(client.updates.length, 0);
  assert.equal(stats.preservedFields, 2);
});

test("dry run reports mutations without sending an update", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Old", "Custom.ChildCustomer": "Old" })],
    [parent({ "Custom.Process": "New", "Custom.Customer": "New" })]
  );

  const stats = await synchronize(client, { ...defaultOptions, dryRun: true }, logger);

  assert.equal(client.updates.length, 0);
  assert.equal(stats.updatedWorkItems, 1);
  assert.equal(stats.updatedFields, 2);
});

test("skips a parent of the wrong work item type", async () => {
  const wrongParent = parent({ "Custom.Process": "New", "Custom.Customer": "New" });
  wrongParent.fields["System.WorkItemType"] = "Feature";
  const client = new FakeClient([child({ "Custom.Process": "Old" })], [wrongParent]);

  const stats = await synchronize(client, defaultOptions, logger);

  assert.equal(client.updates.length, 0);
  assert.equal(stats.wrongParentType, 1);
});

test("records unsupported source values as an item error", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Old" })],
    [parent({ "Custom.Process": { displayName: "Identity" }, "Custom.Customer": "Customer" })]
  );

  const stats = await synchronize(client, defaultOptions, logger);

  assert.equal(client.updates.length, 0);
  assert.equal(stats.errors, 1);
});

test("does not count a failed patch as an applied update", async () => {
  const client = new FakeClient(
    [child({ "Custom.Process": "Old", "Custom.ChildCustomer": "Old" })],
    [parent({ "Custom.Process": "New", "Custom.Customer": "New" })]
  );
  client.failUpdates = true;

  const stats = await synchronize(client, defaultOptions, logger);

  assert.equal(stats.errors, 1);
  assert.equal(stats.updatedWorkItems, 0);
  assert.equal(stats.updatedFields, 0);
});
