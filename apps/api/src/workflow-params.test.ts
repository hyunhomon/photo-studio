import { expect, test } from "bun:test";
import { parseWorkflowParams } from "./workflow-params";

test("REST JSON and binding objects have the same validated Workflow operation", () => {
  const operation = {
    kind: "reference-search-smoke" as const,
    jobId: crypto.randomUUID(),
  };
  expect(parseWorkflowParams(operation)).toEqual(operation);
  expect(parseWorkflowParams(JSON.stringify(operation))).toEqual(operation);
  expect(parseWorkflowParams({ kind: "scaffold-smoke" })).toEqual({
    kind: "scaffold-smoke",
  });
  for (const input of [
    null,
    "not-json",
    { kind: "reference-search-smoke" },
    { kind: "generate", jobId: "not-an-id" },
    { kind: "unknown", jobId: operation.jobId },
  ])
    expect(() => parseWorkflowParams(input)).toThrow();
});
