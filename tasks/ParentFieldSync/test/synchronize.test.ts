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
  replaceChildTags: false,
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
      mutations: [{ field: "Custom.Process", operation: "add", value: "New" }]
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
    { field: "Custom.Process", operation: "remove" },
    { field: "Custom.ChildCustomer", operation: "remove" }
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

test("keeps additive tag updates by default", async () => {
  const options: SyncOptions = {
    ...defaultOptions,
    fieldMappings: [{ source: "System.Tags", target: "System.Tags" }]
  };
  const client = new FakeClient(
    [child({ "System.Tags": "ChildOnly; Shared" })],
    [parent({ "System.Tags": "ParentOnly; Shared" })]
  );

  await synchronize(client, options, logger);

  assert.deepEqual(client.updates[0]?.mutations, [
    { field: "System.Tags", operation: "add", value: "ParentOnly; Shared" }
  ]);
});

test("replaces existing tags when exact tag replacement is enabled", async () => {
  const options: SyncOptions = {
    ...defaultOptions,
    fieldMappings: [
      { source: "Custom.ParentTags", target: "System.Tags" },
      { source: "Custom.Process", target: "Custom.Process" }
    ],
    replaceChildTags: true
  };
  const client = new FakeClient(
    [child({ "System.Tags": "ChildOnly", "Custom.Process": "Old" })],
    [parent({ "Custom.ParentTags": "ParentOnly", "Custom.Process": "New" })]
  );

  await synchronize(client, options, logger);

  assert.deepEqual(client.updates[0]?.mutations, [
    { field: "System.Tags", operation: "replace", value: "ParentOnly" },
    { field: "Custom.Process", operation: "add", value: "New" }
  ]);
});

test("adds tags when the child tag field does not exist in replacement mode", async () => {
  const options: SyncOptions = {
    ...defaultOptions,
    fieldMappings: [{ source: "System.Tags", target: "System.Tags" }],
    replaceChildTags: true
  };
  const client = new FakeClient([child({})], [parent({ "System.Tags": "ParentOnly" })]);

  await synchronize(client, options, logger);

  assert.deepEqual(client.updates[0]?.mutations, [
    { field: "System.Tags", operation: "add", value: "ParentOnly" }
  ]);
});

test("does not update equal tags in replacement mode", async () => {
  const options: SyncOptions = {
    ...defaultOptions,
    fieldMappings: [{ source: "System.Tags", target: "System.Tags" }],
    replaceChildTags: true
  };
  const client = new FakeClient(
    [child({ "System.Tags": "ParentOnly; Shared" })],
    [parent({ "System.Tags": "ParentOnly; Shared" })]
  );

  const stats = await synchronize(client, options, logger);

  assert.equal(client.updates.length, 0);
  assert.equal(stats.unchangedFields, 1);
});

test("keeps tag clearing and no-parent preservation independent of replacement mode", async () => {
  const options: SyncOptions = {
    ...defaultOptions,
    fieldMappings: [{ source: "System.Tags", target: "System.Tags" }],
    replaceChildTags: true
  };
  const childWithParent = child({ "System.Tags": "ChildOnly" });
  const clearClient = new FakeClient([childWithParent], [parent({ "System.Tags": null })]);

  await synchronize(clearClient, options, logger);

  assert.deepEqual(clearClient.updates[0]?.mutations, [
    { field: "System.Tags", operation: "remove" }
  ]);

  const preserveEmptyClient = new FakeClient(
    [child({ "System.Tags": "ChildOnly" })],
    [parent({ "System.Tags": null })]
  );
  const preserveEmptyStats = await synchronize(
    preserveEmptyClient,
    { ...options, preserveChildValueWhenParentEmpty: true },
    logger
  );

  assert.equal(preserveEmptyClient.updates.length, 0);
  assert.equal(preserveEmptyStats.preservedFields, 1);

  const preserveClient = new FakeClient([child({ "System.Tags": "ChildOnly" }, false)], []);
  const stats = await synchronize(
    preserveClient,
    { ...options, preserveChildValueWhenNoParent: true },
    logger
  );

  assert.equal(preserveClient.updates.length, 0);
  assert.equal(stats.preservedFields, 1);
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
