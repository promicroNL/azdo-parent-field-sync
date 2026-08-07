import assert from "node:assert/strict";
import test from "node:test";
import { parseFieldMappings } from "../src/config";

test("parses same-name and cross-field mappings", () => {
  assert.deepEqual(
    parseFieldMappings(`
      # Parent and child use the same field
      Custom.Process
      Custom.Customer = Custom.ChildCustomer
    `),
    [
      { source: "Custom.Process", target: "Custom.Process" },
      { source: "Custom.Customer", target: "Custom.ChildCustomer" }
    ]
  );
});

test("rejects duplicate target fields", () => {
  assert.throws(
    () => parseFieldMappings("Custom.First=Custom.Target\nCustom.Second=custom.target"),
    /mapped more than once/u
  );
});

test("rejects empty mapping input", () => {
  assert.throws(() => parseFieldMappings("\n# nothing configured"), /At least one field mapping/u);
});

test("rejects ambiguous mapping lines", () => {
  assert.throws(() => parseFieldMappings("Custom.A=Custom.B=Custom.C"), /more than one/u);
});

