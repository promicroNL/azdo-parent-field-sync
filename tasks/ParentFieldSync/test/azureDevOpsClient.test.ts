import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { AzureDevOpsClient } from "../src/azureDevOpsClient";
import type { FieldMutation } from "../src/types";

async function captureWorkItemRequest(
  fields: string[],
  includeRelations: boolean
): Promise<URL> {
  let requestUrl: string | undefined;
  const server = createServer((request, response) => {
    requestUrl = request.url;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"value":[]}');
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const client = new AzureDevOpsClient(origin, "Example Project", "test-token");

    await client.getWorkItems([1314, 1315, 1321], fields, includeRelations);

    assert.ok(requestUrl, "Expected the test server to receive a request.");
    return new URL(requestUrl, origin);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function captureUpdateRequest(mutations: FieldMutation[]): Promise<unknown> {
  let requestBody = "";
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      requestBody += chunk;
    });
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const client = new AzureDevOpsClient(
      `http://127.0.0.1:${address.port}`,
      "Example Project",
      "test-token"
    );

    await client.updateFields(1314, 7, mutations);

    return JSON.parse(requestBody) as unknown;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("requests relations without the incompatible fields parameter", async () => {
  const url = await captureWorkItemRequest(
    ["Custom.Process", "Custom.ChildCustomer", "System.Tags"],
    true
  );

  assert.equal(url.searchParams.get("ids"), "1314,1315,1321");
  assert.equal(url.searchParams.get("$expand"), "Relations");
  assert.equal(url.searchParams.has("fields"), false);
  assert.equal(url.searchParams.get("errorPolicy"), "Omit");
  assert.equal(url.searchParams.get("api-version"), "7.1");
});

test("requests only unique selected fields when relations are not needed", async () => {
  const url = await captureWorkItemRequest(
    ["System.WorkItemType", "Custom.Process", "Custom.Process"],
    false
  );

  assert.equal(url.searchParams.get("fields"), "System.WorkItemType,Custom.Process");
  assert.equal(url.searchParams.has("$expand"), false);
});

test("serializes explicit add, replace, and remove field operations", async () => {
  const body = await captureUpdateRequest([
    { field: "Custom.Process", operation: "add", value: "New" },
    { field: "System.Tags", operation: "replace", value: "ParentOnly" },
    { field: "Custom.Obsolete", operation: "remove" }
  ]);

  assert.deepEqual(body, [
    { op: "test", path: "/rev", value: 7 },
    { op: "add", path: "/fields/Custom.Process", value: "New" },
    { op: "replace", path: "/fields/System.Tags", value: "ParentOnly" },
    { op: "remove", path: "/fields/Custom.Obsolete" }
  ]);
});
